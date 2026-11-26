#!/usr/bin/env python3
"""
Local Qwen3-TTS batch synthesis worker for Instance-1419 (Apache-2.0, mlx-audio).

Pipeline (Apple Silicon M1+ safe):
  1. Generate any missing cast/emotion anchor WAVs with Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit
     using fixed seeds, then unload the VoiceDesign model completely.
  2. Load Qwen3-TTS-12Hz-1.7B-Base-4bit ONCE with a bounded MLX cache limit,
     group pending lines by (speaker, anchor, temperature) sorted by length, and
     batch-clone via ICL (`model.batch_generate`) with automatic acoustic quality checks + retry.
  3. Encode each validated WAV through a gentle breath noise-gate, character-specific
     ffmpeg EQ, and two-pass EBU R128 linear loudness normalization into 96 kbps MP3.
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import os
import re
import resource
import subprocess
import sys
import tempfile
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model


def deterministic_seed(key: str) -> int:
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % (2 ** 31 - 1)


def analyze_audio(wav: np.ndarray, sr: int, text: str) -> dict[str, float]:
    wav = np.asarray(wav, dtype=np.float32).reshape(-1)
    dur = len(wav) / float(sr) if sr > 0 else 0.0
    peak = float(np.max(np.abs(wav))) if len(wav) else 0.0
    rms = float(np.sqrt(np.mean(wav ** 2))) if len(wav) else 0.0
    cps = len(text) / dur if dur > 0 else 0.0
    return {
        "duration_s": round(dur, 2),
        "peak": round(peak, 4),
        "rms_db": round(20.0 * math.log10(max(rms, 1e-9)), 1),
        "chars_per_sec": round(cps, 1),
    }


def is_audio_healthy(stats: dict[str, float], text: str) -> tuple[bool, str]:
    dur = stats["duration_s"]
    peak = stats["peak"]
    cps = stats["chars_per_sec"]
    if dur < 0.35:
        return False, f"too short ({dur}s)"
    if peak < 0.02:
        return False, f"near-silent (peak={peak})"
    if len(text) >= 24:
        if cps < 6.0:
            return False, f"possible hallucination/stretch (cps={cps}, dur={dur}s)"
        if cps > 26.0:
            return False, f"possible premature cutoff (cps={cps}, dur={dur}s)"
    if dur > 28.0:
        return False, f"runaway duration ({dur}s)"
    return True, "ok"


def trim_edge_silence(wav: np.ndarray, sr: int, pad_s: float = 0.06) -> np.ndarray:
    """Trim excessive leading/trailing dead silence while preserving natural breath tail."""
    wav = np.asarray(wav, dtype=np.float32).reshape(-1)
    if len(wav) == 0:
        return wav
    peak = float(np.max(np.abs(wav)))
    if peak < 1e-4:
        return wav
    thresh = max(peak * 0.008, 1e-4)
    idx = np.where(np.abs(wav) > thresh)[0]
    if len(idx) == 0:
        return wav
    pad = int(sr * pad_s)
    start = max(0, int(idx[0]) - pad)
    end = min(len(wav), int(idx[-1]) + int(sr * 0.14))
    return wav[start:end]


def encode_mp3(wav: np.ndarray, sr: int, out_path: str, ffmpeg_filter: str) -> None:
    wav = trim_edge_silence(wav, sr)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        tmp_wav = tf.name
    try:
        sf.write(tmp_wav, wav, sr)
        raw_filter = ffmpeg_filter.strip() if ffmpeg_filter else "highpass=f=95,lowpass=f=9800"
        # Strip any inline single-pass loudnorm so we can apply two-pass linear loudnorm cleanly
        parts = [p.strip() for p in raw_filter.split(",") if p.strip() and not p.strip().startswith("loudnorm")]
        pre_chain = ",".join(["agate=threshold=0.008:ratio=2.2:attack=15:release=140", *parts])

        # Pass 1: measure true integrated loudness
        measure = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                tmp_wav,
                "-af",
                f"{pre_chain},loudnorm=I=-17:TP=-1.5:LRA=11:print_format=json",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", measure.stderr, re.DOTALL)
        if m:
            stats = json.loads(m.group(0))
            ln_filter = (
                f"loudnorm=I=-17:TP=-1.5:LRA=11:linear=true:"
                f"measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:"
                f"measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:"
                f"offset={stats['target_offset']}"
            )
            full_filter = f"{pre_chain},{ln_filter}"
        else:
            full_filter = f"{pre_chain},loudnorm=I=-17:TP=-1.5:LRA=11"

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loglevel",
                "error",
                "-i",
                tmp_wav,
                "-af",
                full_filter,
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "96k",
                out_path,
            ],
            check=True,
        )
    finally:
        if os.path.exists(tmp_wav):
            os.unlink(tmp_wav)


def resolve_anchor_spec(
    spk: str,
    emotion: str,
    profiles: dict[str, Any],
    anchors_dir: Path,
    default_temp: float,
) -> dict[str, Any]:
    prof = profiles.get(spk) or profiles.get("narrator") or {}
    q = prof.get("qwen3") or {}
    emo_map = q.get("emotionAnchors") or {}

    spec = emo_map.get(emotion)
    if isinstance(spec, str):
        spec = emo_map.get(spec)
    if not isinstance(spec, dict):
        spec = q

    anchor_name = spec.get("anchorFile") or q.get("anchorFile") or f"{spk}.wav"
    return {
        "anchorKey": anchor_name,
        "path": anchors_dir / anchor_name,
        "text": spec.get("anchorText") or q.get("anchorText", ""),
        "instruct": spec.get("voiceDesignInstruct")
        or q.get("voiceDesignInstruct", "Natural adult English voice, clear studio diction."),
        "seed": int(spec.get("seed", q.get("seed", 14190))),
        "temperature": float(spec.get("temperature", q.get("temperature", default_temp))),
    }


def ensure_anchors(
    needed_specs: dict[str, dict[str, Any]],
    qwen_cfg: dict[str, Any],
    force_anchors: bool = False,
) -> None:
    if not needed_specs:
        return
    anchors_dir = next(iter(needed_specs.values()))["path"].parent
    anchors_dir.mkdir(parents=True, exist_ok=True)

    missing: list[str] = []
    for key, info in needed_specs.items():
        if force_anchors or not info["path"].exists() or info["path"].stat().st_size < 4096:
            missing.append(key)

    if not missing:
        print(f"[qwen3] All {len(needed_specs)} cast anchor(s) cached in {anchors_dir}.", flush=True)
        return

    vd_model_id = qwen_cfg.get("voiceDesignModel", "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit")
    language = qwen_cfg.get("language", "english")
    print(f"[qwen3] Generating {len(missing)} cast anchor(s) via {vd_model_id}: {missing}", flush=True)
    t0 = time.perf_counter()
    vd_model = load_model(vd_model_id)
    print(f"[qwen3] VoiceDesign loaded in {time.perf_counter() - t0:.2f}s", flush=True)

    for key in missing:
        info = needed_specs[key]
        mx.random.seed(info["seed"])
        t1 = time.perf_counter()
        chunks: list[np.ndarray] = []
        sr = vd_model.sample_rate
        for res in vd_model.generate_voice_design(
            text=info["text"],
            instruct=info["instruct"],
            language=language,
            temperature=0.68,
            top_p=0.9,
            repetition_penalty=1.05,
            max_tokens=300,
            verbose=False,
        ):
            chunks.append(np.array(res.audio, dtype=np.float32).reshape(-1))
            sr = res.sample_rate
        wav = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
        wav = trim_edge_silence(wav, sr)
        sf.write(info["path"], wav, sr)
        stats = analyze_audio(wav, sr, info["text"])
        print(
            f"[qwen3] Anchor {key:28s} -> dur={stats['duration_s']:.2f}s "
            f"| cps={stats['chars_per_sec']:.1f} | rms={stats['rms_db']:.1f}dB | gen={time.perf_counter()-t1:.2f}s",
            flush=True,
        )
        mx.clear_cache()

    del vd_model
    gc.collect()
    mx.clear_cache()


def estimate_max_tokens(text: str) -> int:
    return min(360, max(96, int(len(text) * 2.0) + 32))


def synthesize_batch(job_path: Path, force_anchors: bool = False) -> None:
    job = json.loads(job_path.read_text(encoding="utf-8"))
    tasks: list[dict[str, Any]] = job.get("tasks", [])
    if not tasks:
        print("[qwen3] No pending lines to synthesize.", flush=True)
        return

    qwen_cfg: dict[str, Any] = job.get("qwen3Config", {})
    profiles: dict[str, Any] = job.get("profiles", {})
    anchors_dir = Path(job.get("anchorsDir", ".voice-anchors"))

    cache_limit_mb = int(qwen_cfg.get("cacheLimitMb", 512))
    mx.set_cache_limit(cache_limit_mb * 1024 * 1024)
    mx.reset_peak_memory()

    base_model_id = qwen_cfg.get("baseModel", "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-4bit")
    language = qwen_cfg.get("language", "english")
    batch_size = max(1, int(qwen_cfg.get("batchSize", 4)))
    default_temp = float(qwen_cfg.get("temperature", 0.62))
    top_p = float(qwen_cfg.get("topP", 0.9))
    rep_penalty = float(qwen_cfg.get("repetitionPenalty", 1.1))

    # Resolve per-(speaker, emotion) anchor specs and group tasks by (speaker, anchorKey, temp)
    anchor_specs: dict[str, dict[str, Any]] = {}
    grouped: dict[tuple[str, str, float], list[dict[str, Any]]] = defaultdict(list)
    for t in tasks:
        spk = t["speaker"]
        emo = t.get("emotion", "neutral")
        spec = resolve_anchor_spec(spk, emo, profiles, anchors_dir, default_temp)
        a_key = spec["anchorKey"]
        if a_key not in anchor_specs:
            anchor_specs[a_key] = spec
        grouped[(spk, a_key, spec["temperature"])].append(t)

    ensure_anchors(anchor_specs, qwen_cfg, force_anchors=force_anchors)

    print(f"[qwen3] Loading {base_model_id} for {len(tasks)} line(s) (batch_size={batch_size})...", flush=True)
    t_load = time.perf_counter()
    model = load_model(base_model_id)
    print(
        f"[qwen3] Loaded in {time.perf_counter() - t_load:.2f}s | MLX active={mx.get_active_memory()/1e9:.2f}GB",
        flush=True,
    )

    anchor_arrays: dict[str, mx.array] = {}
    for a_key, spec in anchor_specs.items():
        wav, sr = sf.read(spec["path"], dtype="float32")
        if wav.ndim > 1:
            wav = wav.mean(axis=1)
        if sr != model.sample_rate:
            raise ValueError(f"Anchor {a_key} sample rate {sr} != model {model.sample_rate}")
        anchor_arrays[a_key] = mx.array(wav)

    for g_key in grouped:
        grouped[g_key].sort(key=lambda x: len(x["spokenText"]))

    completed = 0
    retries = 0
    total_dur = 0.0
    t_synth_start = time.perf_counter()
    report_lines: list[dict[str, Any]] = []

    def generate_single_retry(
        task: dict[str, Any], a_key: str, seed: int, temp: float
    ) -> tuple[np.ndarray, int]:
        mx.random.seed(seed)
        chunks: list[np.ndarray] = []
        sr = model.sample_rate
        for res in model.generate(
            text=task["spokenText"],
            ref_audio=anchor_arrays[a_key],
            ref_text=anchor_specs[a_key]["text"],
            lang_code=language,
            temperature=temp,
            top_p=top_p,
            repetition_penalty=rep_penalty,
            max_tokens=estimate_max_tokens(task["spokenText"]),
            verbose=False,
        ):
            chunks.append(np.array(res.audio, dtype=np.float32).reshape(-1))
            sr = res.sample_rate
        return (np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)), sr

    for (spk, a_key, spk_temp), grp_tasks in sorted(grouped.items()):
        prof = profiles.get(spk) or profiles.get("narrator") or {}
        ffmpeg_filter = prof.get("ffmpegFilter", "highpass=f=95,lowpass=f=9800")

        print(f"[qwen3] Speaker '{spk}' ({a_key}, temp={spk_temp}): {len(grp_tasks)} line(s)...", flush=True)

        for idx in range(0, len(grp_tasks), batch_size):
            chunk = grp_tasks[idx : idx + batch_size]
            texts = [t["spokenText"] for t in chunk]
            max_toks = max(estimate_max_tokens(tx) for tx in texts)
            batch_seed = deterministic_seed(f"{spk}:{a_key}:{chunk[0]['lineId']}")
            mx.random.seed(batch_seed)

            t_b = time.perf_counter()
            outputs: dict[int, tuple[np.ndarray, int]] = {}
            if len(chunk) == 1:
                wav, sr = generate_single_retry(chunk[0], a_key, batch_seed, spk_temp)
                outputs[0] = (wav, sr)
            else:
                for res in model.batch_generate(
                    texts=texts,
                    ref_audio=anchor_arrays[a_key],
                    ref_text=anchor_specs[a_key]["text"],
                    lang_code=language,
                    temperature=spk_temp,
                    top_p=top_p,
                    repetition_penalty=rep_penalty,
                    max_tokens=max_toks,
                    verbose=False,
                ):
                    outputs[res.sequence_idx] = (
                        np.array(res.audio, dtype=np.float32).reshape(-1),
                        res.sample_rate,
                    )
            batch_dt = time.perf_counter() - t_b

            for b_idx, task in enumerate(chunk):
                wav, sr = outputs[b_idx]
                stats = analyze_audio(wav, sr, task["spokenText"])
                ok, reason = is_audio_healthy(stats, task["spokenText"])
                if not ok:
                    retries += 1
                    print(
                        f"[qwen3] Retry {task['lineId']} ({reason}) with single-line fallback...",
                        flush=True,
                    )
                    wav, sr = generate_single_retry(
                        task, a_key, batch_seed + 97 + b_idx, max(0.48, spk_temp - 0.08)
                    )
                    stats = analyze_audio(wav, sr, task["spokenText"])
                    ok2, reason2 = is_audio_healthy(stats, task["spokenText"])
                    if not ok2:
                        print(f"[qwen3] WARN {task['lineId']} after retry: {reason2}", flush=True)

                encode_mp3(wav, sr, task["outPath"], ffmpeg_filter)
                completed += 1
                total_dur += stats["duration_s"]
                report_lines.append({"lineId": task["lineId"], "speaker": spk, "anchor": a_key, **stats})

            mx.clear_cache()
            elapsed = time.perf_counter() - t_synth_start
            avg_s = elapsed / max(1, completed)
            print(
                f"[qwen3] Progress {completed}/{len(tasks)} ({spk}, batch={len(chunk)} in {batch_dt:.1f}s | avg {avg_s:.1f}s/line)",
                flush=True,
            )

    total_elapsed = time.perf_counter() - t_synth_start
    peak_mlx_gb = round(mx.get_peak_memory() / 1e9, 2)
    peak_rss_gb = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e9, 2)
    print(
        f"[qwen3] COMPLETE: {completed} lines ({total_dur:.1f}s audio) in {total_elapsed:.1f}s "
        f"({total_elapsed/max(1,completed):.2f}s/line, retries={retries}) "
        f"| MLX peak={peak_mlx_gb}GB | RSS peak={peak_rss_gb}GB",
        flush=True,
    )

    report_path = job.get("reportPath")
    if report_path:
        Path(report_path).write_text(
            json.dumps(
                {
                    "model": base_model_id,
                    "completed": completed,
                    "retries": retries,
                    "total_audio_s": round(total_dur, 2),
                    "total_wall_s": round(total_elapsed, 2),
                    "avg_s_per_line": round(total_elapsed / max(1, completed), 2),
                    "mlx_peak_gb": peak_mlx_gb,
                    "rss_peak_gb": peak_rss_gb,
                    "lines": report_lines,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    del model
    gc.collect()
    mx.clear_cache()


def main() -> None:
    parser = argparse.ArgumentParser(description="Qwen3-TTS local batch voice synthesis worker")
    parser.add_argument("--jobs", required=True, help="Path to JSON synthesis job manifest")
    parser.add_argument("--force-anchors", action="store_true", help="Regenerate cast anchor WAVs")
    args = parser.parse_args()
    synthesize_batch(Path(args.jobs), force_anchors=args.force_anchors)


if __name__ == "__main__":
    main()
