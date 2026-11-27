#!/usr/bin/env python3
"""
Local VoxCPM2-8bit batch synthesis + Parakeet TDT v3 STT QA worker for Instance-1419.

Pipeline (Apple Silicon 16 GB unified memory safe):
  1. Load mlx-community/VoxCPM2-8bit ONCE with bounded MLX cache.
  2. Synthesize any missing cast anchors (.voice-anchors/*.wav) via VoiceDesign mode,
     or reuse existing locked Cast 2 anchors (passing file path strings to ref_audio
     so VoxCPM2 resamples cleanly to 16 kHz AudioVAE input).
  3. Synthesize pending dialogue lines sequentially in script order so consecutive
     same-speaker/same-emotion turns can use Combined Reference + Continuation
     (ref_audio + prompt_audio + prompt_text), falling back to standalone
     ref_audio + emotion instruct on turn boundaries or retries.
  4. Unload VoxCPM2, load mlx-community/parakeet-tdt-0.6b-v3, transcribe each newly
     synthesized clip, and compute normalized Levenshtein WER against spokenText.
  5. If any lines exceed sttQaMaxWer, unload Parakeet, reload VoxCPM2 once to retry
     only the failed lines (standalone ref_audio + instruct), and keep the lowest-WER take.
  6. Encode validated 48 kHz audio through anti-click fades, character EQ, and 2-pass
     EBU R128 (-17 LUFS) normalization into 48 kHz mono 128 kbps MP3 (no agate).
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
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.stt import load as load_stt
from mlx_audio.tts.utils import load_model

# ---------------------------------------------------------------------------
# Audio & Text Helpers
# ---------------------------------------------------------------------------

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
        if cps < 6.5:
            return False, f"possible stretch/hallucination (cps={cps}, dur={dur}s)"
        if cps > 24.5:
            return False, f"possible premature cutoff (cps={cps}, dur={dur}s)"
    if dur > 28.0:
        return False, f"runaway duration ({dur}s)"
    return True, "ok"


def trim_edge_silence(wav: np.ndarray, sr: int, pad_s: float = 0.07, tail_s: float = 0.14) -> np.ndarray:
    """Trim dead leading/trailing silence while keeping soft consonant onsets and breath tail."""
    wav = np.asarray(wav, dtype=np.float32).reshape(-1)
    if len(wav) == 0:
        return wav
    peak = float(np.max(np.abs(wav)))
    if peak < 1e-4:
        return wav
    thresh = max(peak * 0.005, 1e-4)
    idx = np.where(np.abs(wav) > thresh)[0]
    if len(idx) == 0:
        return wav
    start = max(0, int(idx[0]) - int(sr * pad_s))
    end = min(len(wav), int(idx[-1]) + int(sr * tail_s))
    return wav[start:end]


def encode_mp3_clean(
    wav: np.ndarray,
    sr: int,
    out_path: str,
    ffmpeg_filter: str,
    bitrate: str = "64k",
    target_sr: int | None = None,
) -> None:
    """
    Encode speech WAV to mono MP3 (default 24 kHz / 64 kbps) with gentle anti-click edge fades,
    character EQ, and 2-pass linear EBU R128 loudness normalization (-17 LUFS).
    Intentionally omits agate so quiet close-mic breaths and soft onsets survive.
    """
    wav = trim_edge_silence(wav, sr)
    out_sr = int(target_sr or sr)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        tmp_wav = tf.name
    try:
        sf.write(tmp_wav, wav, sr)
        raw_filter = ffmpeg_filter.strip() if ffmpeg_filter else "highpass=f=80,lowpass=f=14000"
        parts = [
            p.strip()
            for p in raw_filter.split(",")
            if p.strip() and not p.strip().startswith("loudnorm")
        ]
        # Gentle 15ms fade-in / 30ms fade-out after character EQ prevents filter start/end clicks
        chain_parts = [*parts, "afade=t=in:st=0:d=0.015", "areverse", "afade=t=in:st=0:d=0.030", "areverse"]
        pre_chain = ",".join(chain_parts)

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
                "-ac",
                "1",
                "-ar",
                str(out_sr),
                "-codec:a",
                "libmp3lame",
                "-b:a",
                bitrate,
                out_path,
            ],
            check=True,
        )
    finally:
        if os.path.exists(tmp_wav):
            os.unlink(tmp_wav)


# ---------------------------------------------------------------------------
# WER Normalization & Scoring (for Parakeet TDT v3 QA)
# ---------------------------------------------------------------------------

CONTRACTIONS = {
    "don't": "do not",
    "doesn't": "does not",
    "didn't": "did not",
    "won't": "will not",
    "can't": "cannot",
    "isn't": "is not",
    "aren't": "are not",
    "wasn't": "was not",
    "weren't": "were not",
    "haven't": "have not",
    "hasn't": "has not",
    "hadn't": "had not",
    "wouldn't": "would not",
    "couldn't": "could not",
    "shouldn't": "should not",
    "you're": "you are",
    "we're": "we are",
    "they're": "they are",
    "i'm": "i am",
    "it's": "it is",
    "that's": "that is",
    "there's": "there is",
    "here's": "here is",
    "what's": "what is",
    "who's": "who is",
    "nobody's": "nobody is",
    "someone's": "someone is",
    "everything's": "everything is",
    "i've": "i have",
    "you've": "you have",
    "we've": "we have",
    "they've": "they have",
    "i'll": "i will",
    "you'll": "you will",
    "we'll": "we will",
    "they'll": "they will",
    "i'd": "i would",
    "you'd": "you would",
    "we'd": "we would",
    "they'd": "they would",
    "let's": "let us",
}

ONES = {
    0: "zero", 1: "one", 2: "two", 3: "three", 4: "four",
    5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine",
    10: "ten", 11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen",
    15: "fifteen", 16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen",
}
TENS = {
    20: "twenty", 30: "thirty", 40: "forty", 50: "fifty",
    60: "sixty", 70: "seventy", 80: "eighty", 90: "ninety",
}


def int_to_words(n: int) -> str:
    if n < 20:
        return ONES[n]
    if n < 100:
        t, r = divmod(n, 10)
        return TENS[t * 10] if r == 0 else f"{TENS[t * 10]} {ONES[r]}"
    if n == 100:
        return "one hundred"
    return str(n)


SPECIAL_DIGITS = {
    "1419": "fourteen nineteen",
    "1420": "fourteen twenty",
    "1418": "fourteen eighteen",
    "1411": "fourteen eleven",
    "1406": "fourteen oh six",
    "0812": "oh eight twelve",
    "04": "zero four",
}


def normalize_for_wer(text: str) -> list[str]:
    s = text.lower()
    s = re.sub(r"(?<=\d),(?=\d)", "", s)
    s = s.replace("’", "'").replace("—", " ").replace("–", " ").replace("-", " ")
    for k, v in CONTRACTIONS.items():
        s = re.sub(rf"\b{re.escape(k)}\b", v, s)
    for k, v in SPECIAL_DIGITS.items():
        s = re.sub(rf"\b{re.escape(k)}\b", v, s)
    s = re.sub(r"\b(\d{1,3})\b", lambda m: int_to_words(int(m.group(1))) if int(m.group(1)) <= 100 else m.group(1), s)
    # Normalize 4-digit year-like numbers ("41802" -> "forty one thousand eight hundred two", "1419" already handled above)
    s = re.sub(r"\b41802\b", "forty one thousand eight hundred and two", s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s.split(" ") if s else []


def compute_wer(ref_text: str, hyp_text: str) -> float:
    ref = normalize_for_wer(ref_text)
    hyp = normalize_for_wer(hyp_text)
    if not ref:
        return 0.0 if not hyp else 1.0
    n, m = len(ref), len(hyp)
    dp = list(range(m + 1))
    for i in range(1, n + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, m + 1):
            cur = dp[j]
            if ref[i - 1] == hyp[j - 1]:
                dp[j] = prev
            else:
                dp[j] = 1 + min(prev, dp[j], dp[j - 1])
            prev = cur
    return round(dp[m] / float(n), 3)


def wer_threshold(ref_text: str, default_max: float) -> float:
    wc = len(normalize_for_wer(ref_text))
    if wc < 5:
        return max(default_max, 0.25)
    return default_max


def has_onset_drop(ref_text: str, hyp_text: str) -> bool:
    ref = normalize_for_wer(ref_text)
    hyp = normalize_for_wer(hyp_text)
    if len(ref) < 2 or not hyp:
        return len(ref) >= 1 and not hyp
    return len(hyp) < len(ref) and hyp[0] != ref[0] and hyp[0] == ref[1]


# ---------------------------------------------------------------------------
# Profile & Anchor Resolution
# ---------------------------------------------------------------------------

def resolve_vox_spec(spk: str, emotion: str, profiles: dict[str, Any], anchors_dir: Path) -> dict[str, Any]:
    prof = profiles.get(spk) or profiles.get("narrator") or {}
    v = prof.get("voxcpm2") or {}
    q = prof.get("qwen3") or {}
    emo_map = v.get("emotionInstructs") or {}

    instruct = emo_map.get(emotion) or v.get("defaultInstruct") or q.get("voiceDesignInstruct") or (
        "Natural adult English voice, understated close-mic delivery."
    )
    anchor_file = v.get("anchorFile") or q.get("anchorFile") or f"{spk}.wav"
    return {
        "anchorKey": anchor_file,
        "anchorPath": anchors_dir / anchor_file,
        "anchorInstruct": v.get("anchorInstruct") or q.get("voiceDesignInstruct") or instruct,
        "anchorText": v.get("anchorText") or q.get("anchorText") or "",
        "anchorSeed": int(v.get("seed", q.get("seed", 14190))),
        "instruct": instruct,
        "ffmpegFilter": prof.get("ffmpegFilter", "highpass=f=80,lowpass=f=12000"),
    }


def ensure_anchors(
    model: Any,
    anchor_specs: dict[str, dict[str, Any]],
    *,
    timesteps: int,
    cfg_value: float,
    force_anchors: bool,
) -> None:
    if not anchor_specs:
        return
    anchors_dir = next(iter(anchor_specs.values()))["anchorPath"].parent
    anchors_dir.mkdir(parents=True, exist_ok=True)

    missing = [
        k for k, spec in anchor_specs.items()
        if force_anchors or not spec["anchorPath"].exists() or spec["anchorPath"].stat().st_size < 4096
    ]
    if not missing:
        print(f"[voxcpm2] All {len(anchor_specs)} cast anchor(s) ready in {anchors_dir}.", flush=True)
        return

    print(f"[voxcpm2] Generating {len(missing)} missing cast anchor(s): {missing}", flush=True)
    for key in missing:
        spec = anchor_specs[key]
        mx.random.seed(spec["anchorSeed"])
        t0 = time.perf_counter()
        res = next(
            model.generate(
                text=spec["anchorText"],
                instruct=spec["anchorInstruct"],
                inference_timesteps=max(timesteps, 12),
                cfg_value=cfg_value,
                warmup_patches=1,
                max_tokens=max(320, int(len(spec["anchorText"]) * 4.5) + 120),
            )
        )
        wav = trim_edge_silence(np.array(res.audio, dtype=np.float32).reshape(-1), int(res.sample_rate))
        sf.write(spec["anchorPath"], wav, int(res.sample_rate))
        stats = analyze_audio(wav, int(res.sample_rate), spec["anchorText"])
        print(
            f"[voxcpm2] Anchor {key:30s} -> dur={stats['duration_s']:.2f}s "
            f"| cps={stats['chars_per_sec']:.1f} | gen={time.perf_counter() - t0:.2f}s",
            flush=True,
        )
        mx.clear_cache()


def synthesize_one_line(
    model: Any,
    *,
    text: str,
    seed: int,
    ref_audio_path: Path,
    instruct: str | None,
    timesteps: int,
    cfg_value: float,
    warmup_patches: int,
    prompt_audio_path: Path | None = None,
    prompt_text: str | None = None,
) -> tuple[np.ndarray, int, float]:
    mx.random.seed(seed)
    t0 = time.perf_counter()
    kwargs: dict[str, Any] = {
        "text": text,
        "ref_audio": str(ref_audio_path),  # ALWAYS file path str so VoxCPM2 resamples to 16kHz
        "inference_timesteps": timesteps,
        "cfg_value": cfg_value,
        "warmup_patches": 0 if prompt_audio_path is not None else warmup_patches,
        "max_tokens": max(240, min(1400, int(len(text) * 4.5) + 120)),
    }
    if instruct and prompt_audio_path is None:
        kwargs["instruct"] = instruct
    if prompt_audio_path is not None and prompt_text is not None:
        kwargs["prompt_audio"] = str(prompt_audio_path)
        kwargs["prompt_text"] = prompt_text

    res = next(model.generate(**kwargs))
    gen_dt = time.perf_counter() - t0
    wav = np.array(res.audio, dtype=np.float32).reshape(-1)
    sr = int(res.sample_rate)
    mx.clear_cache()
    return wav, sr, gen_dt


# ---------------------------------------------------------------------------
# Main Batch + Parakeet QA Pipeline
# ---------------------------------------------------------------------------

def synthesize_batch(
    job_path: Path,
    *,
    force_anchors: bool = False,
    skip_stt_qa: bool = False,
    no_continuation: bool = False,
) -> None:
    job = json.loads(job_path.read_text(encoding="utf-8"))
    tasks: list[dict[str, Any]] = job.get("tasks", [])
    if not tasks:
        print("[voxcpm2] No pending lines to synthesize.", flush=True)
        return

    cfg: dict[str, Any] = job.get("voxcpm2Config", {})
    profiles: dict[str, Any] = job.get("profiles", {})
    anchors_dir = Path(job.get("anchorsDir", ".voice-anchors"))

    model_id = cfg.get("model", "mlx-community/VoxCPM2-8bit")
    timesteps = int(cfg.get("inferenceTimesteps", 10))
    cfg_value = float(cfg.get("cfgValue", 2.0))
    warmup_patches = int(cfg.get("warmupPatches", 1))
    cache_limit_mb = int(cfg.get("cacheLimitMb", 2048))
    bitrate = str(cfg.get("deliveryBitrate", cfg.get("bitrate", "64k")))
    target_sr = int(cfg.get("deliverySampleRate", cfg.get("sampleRate", 24000)))
    enable_continuation = bool(cfg.get("enableContinuation", True)) and not no_continuation
    stt_model_id = cfg.get("sttQaModel", "mlx-community/parakeet-tdt-0.6b-v3")
    max_wer_default = float(cfg.get("sttQaMaxWer", 0.20))
    stt_max_retries = int(cfg.get("sttQaMaxRetries", 2))

    mx.set_cache_limit(cache_limit_mb * 1024 * 1024)
    mx.reset_peak_memory()

    anchor_specs: dict[str, dict[str, Any]] = {}
    task_specs: dict[str, dict[str, Any]] = {}
    for t in tasks:
        spec = resolve_vox_spec(t["speaker"], t.get("emotion", "neutral"), profiles, anchors_dir)
        task_specs[t["lineId"]] = spec
        if spec["anchorKey"] not in anchor_specs:
            anchor_specs[spec["anchorKey"]] = spec

    print(f"[voxcpm2] Loading {model_id} for {len(tasks)} pending line(s)...", flush=True)
    t_load = time.perf_counter()
    model = load_model(model_id)
    print(
        f"[voxcpm2] Loaded in {time.perf_counter() - t_load:.2f}s | MLX active={mx.get_active_memory()/1e9:.2f}GB",
        flush=True,
    )

    ensure_anchors(
        model,
        anchor_specs,
        timesteps=timesteps,
        cfg_value=cfg_value,
        force_anchors=force_anchors,
    )

    tmp_dir = Path(tempfile.mkdtemp(prefix="i1419_vox_raw_"))
    t_start = time.perf_counter()
    acoustic_retries = 0
    records: dict[str, dict[str, Any]] = {}

    try:
        # ------------------------------------------------------------------
        # Phase A: Synthesize all pending lines in script order
        # ------------------------------------------------------------------
        for idx, t in enumerate(tasks, start=1):
            lid = t["lineId"]
            spk = t["speaker"]
            emo = t.get("emotion", "neutral")
            text = t["spokenText"]
            spec = task_specs[lid]
            base_seed = deterministic_seed(f"voxcpm2:{spk}:{emo}:{lid}")

            prev_id = t.get("turnPrevLineId")
            prev_text = t.get("turnPrevSpokenText")
            prev_wav_path = tmp_dir / f"{prev_id}.wav" if prev_id else None
            use_cont = False
            if (
                enable_continuation
                and prev_wav_path is not None
                and prev_wav_path.exists()
                and prev_text
                and records.get(prev_id, {}).get("duration_s", 99.0) <= 10.5
            ):
                use_cont = True

            wav, sr, gen_dt = synthesize_one_line(
                model,
                text=text,
                seed=base_seed,
                ref_audio_path=spec["anchorPath"],
                instruct=None if use_cont else spec["instruct"],
                timesteps=timesteps,
                cfg_value=cfg_value,
                warmup_patches=warmup_patches,
                prompt_audio_path=prev_wav_path if use_cont else None,
                prompt_text=prev_text if use_cont else None,
            )
            trimmed = trim_edge_silence(wav, sr)
            stats = analyze_audio(trimmed, sr, text)
            ok, reason = is_audio_healthy(stats, text)

            if not ok:
                acoustic_retries += 1
                print(f"[voxcpm2] Acoustic retry {lid} ({reason}) -> standalone instruct...", flush=True)
                wav, sr, dt2 = synthesize_one_line(
                    model,
                    text=text,
                    seed=base_seed + 41,
                    ref_audio_path=spec["anchorPath"],
                    instruct=spec["instruct"],
                    timesteps=max(timesteps, 12),
                    cfg_value=max(cfg_value, 2.15),
                    warmup_patches=warmup_patches,
                )
                gen_dt += dt2
                trimmed = trim_edge_silence(wav, sr)
                stats = analyze_audio(trimmed, sr, text)
                ok2, reason2 = is_audio_healthy(stats, text)
                use_cont = False
                if not ok2:
                    print(f"[voxcpm2] WARN {lid} after acoustic retry: {reason2}", flush=True)

            raw_path = tmp_dir / f"{lid}.wav"
            sf.write(raw_path, trimmed, sr)
            encode_mp3_clean(
                trimmed,
                sr,
                t["outPath"],
                spec["ffmpegFilter"],
                bitrate=bitrate,
                target_sr=target_sr,
            )

            records[lid] = {
                "lineId": lid,
                "speaker": spk,
                "emotion": emo,
                "anchor": spec["anchorKey"],
                "continuedFrom": prev_id if use_cont else None,
                "rawPath": raw_path,
                "sr": sr,
                "gen_s": round(gen_dt, 2),
                **stats,
            }

            if idx % 10 == 0 or idx == len(tasks):
                elapsed = time.perf_counter() - t_start
                print(
                    f"[voxcpm2] Synth progress {idx}/{len(tasks)} "
                    f"({lid}, dur={stats['duration_s']:.2f}s, avg={elapsed/idx:.2f}s/line)",
                    flush=True,
                )

        # Unload VoxCPM2 cleanly before loading Parakeet STT
        del model
        gc.collect()
        mx.clear_cache()

        # ------------------------------------------------------------------
        # Phase B & C: Parakeet STT WER Verification & Targeted Retries
        # ------------------------------------------------------------------
        wer_retries = 0
        if not skip_stt_qa:
            print(f"[voxcpm2] Loading Parakeet STT QA ({stt_model_id})...", flush=True)
            t_stt = time.perf_counter()
            stt_model = load_stt(stt_model_id)
            print(f"[voxcpm2] Parakeet loaded in {time.perf_counter() - t_stt:.2f}s", flush=True)

            failed_tasks: list[dict[str, Any]] = []
            for t in tasks:
                lid = t["lineId"]
                rec = records[lid]
                hyp = stt_model.generate(str(rec["rawPath"])).text.strip()
                wer = compute_wer(t["spokenText"], hyp)
                thresh = wer_threshold(t["spokenText"], max_wer_default)
                rec["transcript"] = hyp
                rec["wer"] = wer
                if wer > thresh or has_onset_drop(t["spokenText"], hyp):
                    failed_tasks.append(t)

            del stt_model
            gc.collect()
            mx.clear_cache()

            if failed_tasks:
                print(
                    f"[voxcpm2] {len(failed_tasks)}/{len(tasks)} line(s) exceeded WER threshold; "
                    f"reloading VoxCPM2 for targeted retries...",
                    flush=True,
                )
                for round_idx in range(1, stt_max_retries + 1):
                    if not failed_tasks:
                        break
                    model = load_model(model_id)
                    candidates: dict[str, tuple[Path, np.ndarray, int, dict[str, float], float]] = {}
                    for t in failed_tasks:
                        lid = t["lineId"]
                        spec = task_specs[lid]
                        wer_retries += 1
                        retry_seed = deterministic_seed(f"voxcpm2:retry{round_idx}:{lid}")
                        wav, sr, dt_r = synthesize_one_line(
                            model,
                            text=t["spokenText"],
                            seed=retry_seed,
                            ref_audio_path=spec["anchorPath"],
                            instruct=spec["instruct"],
                            timesteps=max(timesteps, 12),
                            cfg_value=max(cfg_value, 2.15),
                            warmup_patches=warmup_patches,
                        )
                        trimmed = trim_edge_silence(wav, sr)
                        stats = analyze_audio(trimmed, sr, t["spokenText"])
                        cand_path = tmp_dir / f"{lid}_r{round_idx}.wav"
                        sf.write(cand_path, trimmed, sr)
                        candidates[lid] = (cand_path, trimmed, sr, stats, dt_r)
                    del model
                    gc.collect()
                    mx.clear_cache()

                    stt_model = load_stt(stt_model_id)
                    still_failing: list[dict[str, Any]] = []
                    for t in failed_tasks:
                        lid = t["lineId"]
                        rec = records[lid]
                        cand_path, trimmed, sr, stats, dt_r = candidates[lid]
                        hyp = stt_model.generate(str(cand_path)).text.strip()
                        new_wer = compute_wer(t["spokenText"], hyp)
                        ok_ac, _ = is_audio_healthy(stats, t["spokenText"])
                        thresh = wer_threshold(t["spokenText"], max_wer_default)
                        had_onset_drop = has_onset_drop(t["spokenText"], rec.get("transcript", ""))
                        new_onset_drop = has_onset_drop(t["spokenText"], hyp)
                        improved = new_wer < rec["wer"] or (had_onset_drop and not new_onset_drop and new_wer <= thresh)
                        if ok_ac and improved:
                            print(
                                f"  [qa-retry {round_idx}] {lid}: WER improved {rec['wer']:.3f} -> {new_wer:.3f}",
                                flush=True,
                            )
                            shutil.copy2(cand_path, rec["rawPath"])
                            encode_mp3_clean(
                                trimmed,
                                sr,
                                t["outPath"],
                                task_specs[lid]["ffmpegFilter"],
                                bitrate=bitrate,
                                target_sr=target_sr,
                            )
                            rec["wer"] = new_wer
                            rec["transcript"] = hyp
                            rec["duration_s"] = stats["duration_s"]
                            rec["chars_per_sec"] = stats["chars_per_sec"]
                            rec["peak"] = stats["peak"]
                            rec["rms_db"] = stats["rms_db"]
                            rec["gen_s"] = round(rec["gen_s"] + dt_r, 2)
                        else:
                            print(
                                f"  [qa-retry {round_idx}] {lid}: kept prior ({rec['wer']:.3f} vs {new_wer:.3f})",
                                flush=True,
                            )
                        if rec["wer"] > thresh or has_onset_drop(t["spokenText"], rec.get("transcript", "")):
                            still_failing.append(t)
                    del stt_model
                    gc.collect()
                    mx.clear_cache()
                    failed_tasks = still_failing

        total_elapsed = time.perf_counter() - t_start
        total_dur = sum(r["duration_s"] for r in records.values())
        wers = [r["wer"] for r in records.values() if "wer" in r]
        avg_wer = round(sum(wers) / len(wers), 4) if wers else None
        failed_final = [
            r["lineId"]
            for t in tasks
            for r in [records[t["lineId"]]]
            if "wer" in r
            and (
                r["wer"] > wer_threshold(t["spokenText"], max_wer_default)
                or has_onset_drop(t["spokenText"], r.get("transcript", ""))
            )
        ]

        peak_mlx_gb = round(mx.get_peak_memory() / 1e9, 2)
        peak_rss_gb = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e9, 2)

        wer_str = f" | avg_wer={avg_wer:.3f} (above_thresh={len(failed_final)})" if avg_wer is not None else ""
        print(
            f"[voxcpm2] COMPLETE: {len(records)} lines ({total_dur:.1f}s audio) in {total_elapsed:.1f}s "
            f"({total_elapsed/max(1, len(records)):.2f}s/line, acoustic_retries={acoustic_retries}, "
            f"wer_retries={wer_retries}{wer_str}) | MLX peak={peak_mlx_gb}GB | RSS peak={peak_rss_gb}GB",
            flush=True,
        )
        if failed_final:
            print(f"[voxcpm2] Lines still above WER threshold: {failed_final}", flush=True)

        report_path = job.get("reportPath")
        if report_path:
            clean_lines = []
            for t in tasks:
                r = dict(records[t["lineId"]])
                r.pop("rawPath", None)
                clean_lines.append(r)
            Path(report_path).write_text(
                json.dumps(
                    {
                        "model": model_id,
                        "completed": len(records),
                        "acoustic_retries": acoustic_retries,
                        "wer_retries": wer_retries,
                        "avg_wer": avg_wer,
                        "failed_wer_lines": failed_final,
                        "total_audio_s": round(total_dur, 2),
                        "total_wall_s": round(total_elapsed, 2),
                        "avg_s_per_line": round(total_elapsed / max(1, len(records)), 2),
                        "mlx_peak_gb": peak_mlx_gb,
                        "rss_peak_gb": peak_rss_gb,
                        "lines": clean_lines,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="VoxCPM2-8bit local batch voice synthesis + Parakeet QA worker")
    parser.add_argument("--jobs", required=True, help="Path to JSON synthesis job manifest")
    parser.add_argument("--force-anchors", action="store_true", help="Regenerate cast anchor WAVs")
    parser.add_argument("--skip-stt-qa", action="store_true", help="Skip Parakeet TDT v3 STT WER QA pass")
    parser.add_argument("--no-continuation", action="store_true", help="Disable multi-line turn continuation")
    args = parser.parse_args()
    synthesize_batch(
        Path(args.jobs),
        force_anchors=args.force_anchors,
        skip_stt_qa=args.skip_stt_qa,
        no_continuation=args.no_continuation,
    )


if __name__ == "__main__":
    main()
