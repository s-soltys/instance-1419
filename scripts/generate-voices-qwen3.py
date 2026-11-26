#!/usr/bin/env python3
"""
Local Qwen3-TTS batch synthesis worker for Instance-1419 (Apache-2.0, mlx-audio).

Pipeline (8 GB Apple Silicon M1 safe):
  1. Generate any missing cast anchor WAVs with Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit
     using fixed seeds, then unload the VoiceDesign model completely.
  2. Load Qwen3-TTS-12Hz-1.7B-Base-4bit ONCE with a bounded MLX cache limit,
     group pending lines by speaker sorted by length, and batch-clone via ICL
     (`model.batch_generate`) with automatic acoustic quality checks + retry.
  3. Encode each validated WAV through character-specific ffmpeg EQ + EBU R128
     loudness normalization into 96 kbps MP3.
"""
from __future__ import annotations

import argparse
import gc
import json
import math
import os
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
        base_filter = ffmpeg_filter.strip() if ffmpeg_filter else "highpass=f=95,lowpass=f=9800"
        # Append broadcast EBU R128 loudness normalization if not already present
        if "loudnorm" not in base_filter:
            full_filter = f"{base_filter},loudnorm=I=-17:TP=-1.5:LRA=11"
        else:
            full_filter = base_filter
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


def ensure_anchors(
    needed_speakers: list[str],
    profiles: dict[str, Any],
    anchors_dir: Path,
    qwen_cfg: dict[str, Any],
    force_anchors: bool = False,
) -> dict[str, dict[str, Any]]:
    anchors_dir.mkdir(parents=True, exist_ok=True)
    missing: list[str] = []
    resolved: dict[str, dict[str, Any]] = {}

    for spk in needed_speakers:
        prof = profiles.get(spk) or profiles.get("narrator") or {}
        q = prof.get("qwen3") or {}
        anchor_name = q.get("anchorFile") or f"{spk}.wav"
        anchor_path = anchors_dir / anchor_name
        resolved[spk] = {
            "path": anchor_path,
            "text": q.get("anchorText", ""),
            "instruct": q.get("voiceDesignInstruct", "Natural adult English voice, clear studio diction."),
            "seed": int(q.get("seed", 14190)),
        }
        if force_anchors or not anchor_path.exists() or anchor_path.stat().st_size < 4096:
            missing.append(spk)

    if not missing:
        print(f"[qwen3] All {len(needed_speakers)} cast anchor(s) cached in {anchors_dir}.", flush=True)
        return resolved

    vd_model_id = qwen_cfg.get("voiceDesignModel", "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit")
    language = qwen_cfg.get("language", "english")
    print(f"[qwen3] Generating {len(missing)} missing cast anchor(s) via {vd_model_id}: {missing}", flush=True)
    t0 = time.perf_counter()
    vd_model = load_model(vd_model_id)
    print(f"[qwen3] VoiceDesign loaded in {time.perf_counter() - t0:.2f}s", flush=True)

    for spk in missing:
        info = resolved[spk]
        mx.random.seed(info["seed"])
        t1 = time.perf_counter()
        chunks: list[np.ndarray] = []
        sr = vd_model.sample_rate
        for res in vd_model.generate_voice_design(
            text=info["text"],
            instruct=info["instruct"],
            language=language,
            temperature=0.7,
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
            f"[qwen3] Anchor {spk:16s} -> {info['path'].name} | dur={stats['duration_s']:.2f}s "
            f"| cps={stats['chars_per_sec']:.1f} | rms={stats['rms_db']:.1f}dB | gen={time.perf_counter()-t1:.2f}s",
            flush=True,
        )
        mx.clear_cache()

    # Release VoiceDesign completely before loading Base model on 8 GB M1
    del vd_model
    gc.collect()
    mx.clear_cache()
    return resolved


def estimate_max_tokens(text: str) -> int:
    # 12 Hz codec = 12 tokens/sec. Normal speech ~13 chars/sec => ~0.92 tok/char.
    # Give ~2.2x generous headroom capped to prevent runaway degeneration.
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

    needed_speakers = sorted({t["speaker"] for t in tasks})
    anchors = ensure_anchors(needed_speakers, profiles, anchors_dir, qwen_cfg, force_anchors=force_anchors)

    base_model_id = qwen_cfg.get("baseModel", "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-4bit")
    language = qwen_cfg.get("language", "english")
    batch_size = max(1, int(qwen_cfg.get("batchSize", 4)))
    default_temp = float(qwen_cfg.get("temperature", 0.65))
    top_p = float(qwen_cfg.get("topP", 0.9))
    rep_penalty = float(qwen_cfg.get("repetitionPenalty", 1.5))

    print(f"[qwen3] Loading {base_model_id} for {len(tasks)} line(s) (batch_size={batch_size})...", flush=True)
    t_load = time.perf_counter()
    model = load_model(base_model_id)
    print(
        f"[qwen3] Loaded in {time.perf_counter() - t_load:.2f}s | MLX active={mx.get_active_memory()/1e9:.2f}GB",
        flush=True,
    )

    # Preload anchor waveforms once
    anchor_arrays: dict[str, mx.array] = {}
    for spk in needed_speakers:
        wav, sr = sf.read(anchors[spk]["path"], dtype="float32")
        if wav.ndim > 1:
            wav = wav.mean(axis=1)
        if sr != model.sample_rate:
            raise ValueError(f"Anchor {spk} sample rate {sr} != model {model.sample_rate}")
        anchor_arrays[spk] = mx.array(wav)

    # Group by speaker and sort by spokenText length to minimize batch padding waste
    by_speaker: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for t in tasks:
        by_speaker[t["speaker"]].append(t)
    for spk in by_speaker:
        by_speaker[spk].sort(key=lambda x: len(x["spokenText"]))

    completed = 0
    retries = 0
    total_dur = 0.0
    t_synth_start = time.perf_counter()
    report_lines: list[dict[str, Any]] = []

    def generate_single_retry(task: dict[str, Any], spk: str, seed: int, temp: float) -> tuple[np.ndarray, int]:
        mx.random.seed(seed)
        chunks: list[np.ndarray] = []
        sr = model.sample_rate
        for res in model.generate(
            text=task["spokenText"],
            ref_audio=anchor_arrays[spk],
            ref_text=anchors[spk]["text"],
            lang_code=language,
            temperature=temp,
            top_p=top_p,
            repetition_penalty=max(rep_penalty, 1.5),
            max_tokens=estimate_max_tokens(task["spokenText"]),
            verbose=False,
        ):
            chunks.append(np.array(res.audio, dtype=np.float32).reshape(-1))
            sr = res.sample_rate
        return (np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)), sr

    for spk in needed_speakers:
        spk_tasks = by_speaker[spk]
        prof = profiles.get(spk) or profiles.get("narrator") or {}
        q_prof = prof.get("qwen3") or {}
        spk_temp = float(q_prof.get("temperature", default_temp))
        ffmpeg_filter = prof.get("ffmpegFilter", "highpass=f=95,lowpass=f=9800")

        print(f"[qwen3] Speaker '{spk}': {len(spk_tasks)} line(s)...", flush=True)

        for idx in range(0, len(spk_tasks), batch_size):
            chunk = spk_tasks[idx : idx + batch_size]
            texts = [t["spokenText"] for t in chunk]
            max_toks = max(estimate_max_tokens(tx) for tx in texts)
            batch_seed = abs(hash((spk, chunk[0]["lineId"]))) % (2 ** 31 - 1)
            mx.random.seed(batch_seed)

            t_b = time.perf_counter()
            outputs: dict[int, tuple[np.ndarray, int]] = {}
            if len(chunk) == 1:
                wav, sr = generate_single_retry(chunk[0], spk, batch_seed, spk_temp)
                outputs[0] = (wav, sr)
            else:
                for res in model.batch_generate(
                    texts=texts,
                    ref_audio=anchor_arrays[spk],
                    ref_text=anchors[spk]["text"],
                    lang_code=language,
                    temperature=spk_temp,
                    top_p=top_p,
                    repetition_penalty=max(rep_penalty, 1.5),
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
                    wav, sr = generate_single_retry(task, spk, batch_seed + 97 + b_idx, max(0.5, spk_temp - 0.1))
                    stats = analyze_audio(wav, sr, task["spokenText"])
                    ok2, reason2 = is_audio_healthy(stats, task["spokenText"])
                    if not ok2:
                        print(f"[qwen3] WARN {task['lineId']} after retry: {reason2}", flush=True)

                encode_mp3(wav, sr, task["outPath"], ffmpeg_filter)
                completed += 1
                total_dur += stats["duration_s"]
                report_lines.append({"lineId": task["lineId"], "speaker": spk, **stats})

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
