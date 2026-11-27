#!/usr/bin/env python3
"""
Generate local Qwen3-TTS voice audition candidates (Takes A/B/C + fractured) for Instance-1419
and package existing locked Cast 2 reference clips for the Character Casting Studio (?studio=1).

Outputs:
  .dev-auditions/<speaker>_<take>.mp3
  .dev-auditions/ref_<id>.mp3
  .dev-auditions/manifest.json
"""
from __future__ import annotations

import gc
import importlib.util
import json
import shutil
import sys
import time
from pathlib import Path
from typing import Any

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

ROOT = Path(__file__).resolve().parent.parent
PROFILES_PATH = ROOT / "src" / "content" / "voice_profiles.json"
VOICES_DIR = ROOT / "public" / "voices"
ANCHORS_DIR = ROOT / ".voice-anchors"
OUT_DIR = ROOT / ".dev-auditions"

# Import shared encode/analyze helpers from scripts/generate-voices-qwen3.py without modifying it
_worker_path = ROOT / "scripts" / "generate-voices-qwen3.py"
_spec = importlib.util.spec_from_file_location("qwen3_worker", _worker_path)
assert _spec and _spec.loader
qwen3_worker = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(qwen3_worker)

NEW_DREAM_PERSONAS = [
    "phantom_parent",
    "phantom_upload_witness",
    "phantom_afternoon_stranger",
    "phantom_rival",
    "phantom_younger_self",
    "phantom_skeptic",
    "phantom_technician",
    "phantom_waiting_room",
]

LOCKED_REFS = [
    {
        "id": "ref_overseer",
        "speaker": "overseer",
        "label": "Locked Reference · Overseer-1419",
        "mode": "reference",
        "file": "auditions/ref_overseer.mp3",
        "source": "wak_ov_open_1.mp3",
    },
    {
        "id": "ref_sibling_warm",
        "speaker": "sibling_primary",
        "label": "Locked Reference · Sibling 1420 (Warm)",
        "mode": "reference",
        "file": "auditions/ref_sibling_warm.mp3",
        "source": "sib_open_1.mp3",
    },
    {
        "id": "ref_sibling_clipped",
        "speaker": "sibling_primary",
        "label": "Locked Reference · Sibling 1420 (Clipped)",
        "mode": "reference",
        "file": "auditions/ref_sibling_clipped.mp3",
        "source": "sib_open_low.mp3",
    },
    {
        "id": "ref_spouse_warm",
        "speaker": "phantom_spouse",
        "label": "Locked Reference · Spouse (Warm)",
        "mode": "reference",
        "file": "auditions/ref_spouse_warm.mp3",
        "source": "pro_kit_open_1.mp3",
    },
    {
        "id": "ref_spouse_fractured",
        "speaker": "phantom_spouse",
        "label": "Locked Reference · Spouse (Fractured)",
        "mode": "reference",
        "file": "auditions/ref_spouse_fractured.mp3",
        "source": "dream_t1_low_a.mp3",
    },
    {
        "id": "ref_archive_1406",
        "speaker": "archive_echo",
        "label": "Locked Reference · Archive 1406",
        "mode": "reference",
        "file": "auditions/ref_archive_1406.mp3",
        "source": "arch_1406_log.mp3",
    },
    {
        "id": "ref_future_humanity",
        "speaker": "future_humanity",
        "label": "Locked Reference · Future Humanity",
        "mode": "reference",
        "file": "auditions/ref_future_humanity.mp3",
        "source": "future_warm.mp3",
    },
]


def find_existing_voice_clip(preferred_prefix: str, fallback_file: str) -> Path | None:
    cand = VOICES_DIR / fallback_file
    if cand.exists() and cand.stat().st_size > 1024:
        return cand
    matches = sorted(VOICES_DIR.glob(f"{preferred_prefix}*.mp3"))
    for m in matches:
        if m.stat().st_size > 1024:
            return m
    return None


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    profiles_doc = json.loads(PROFILES_PATH.read_text(encoding="utf-8"))
    qwen_cfg = profiles_doc.get("qwen3", {})
    profiles = profiles_doc.get("profiles", {})

    cache_limit_mb = int(qwen_cfg.get("cacheLimitMb", 512))
    mx.set_cache_limit(cache_limit_mb * 1024 * 1024)
    mx.reset_peak_memory()

    vd_model_id = qwen_cfg.get("voiceDesignModel", "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit")
    base_model_id = qwen_cfg.get("baseModel", "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-4bit")
    language = qwen_cfg.get("language", "english")

    manifest: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "references": [],
        "auditions": {},
    }

    # 1. Copy locked Cast 2 reference clips
    voice_script_path = ROOT / "src" / "content" / "dialogue" / "compiled" / "voice_script.json"
    line_text_by_file: dict[str, str] = {}
    if voice_script_path.exists():
        vs = json.loads(voice_script_path.read_text(encoding="utf-8"))
        for entry in vs.get("lines", []):
            af = Path(entry.get("audioFile", "")).name
            if af:
                line_text_by_file[af] = entry.get("spokenText") or entry.get("text") or ""

    for ref in LOCKED_REFS:
        src = find_existing_voice_clip(ref["source"].split(".")[0], ref["source"])
        if not src:
            # fallback lookup by speaker in voice_script.json
            if voice_script_path.exists():
                vs = json.loads(voice_script_path.read_text(encoding="utf-8"))
                for entry in vs.get("lines", []):
                    if entry.get("speaker") == ref["speaker"]:
                        cand = VOICES_DIR / Path(entry["audioFile"]).name
                        if cand.exists() and cand.stat().st_size > 1024:
                            src = cand
                            break
        if src and src.exists():
            dst = OUT_DIR / Path(ref["file"]).name
            shutil.copy2(src, dst)
            manifest["references"].append(
                {
                    "id": ref["id"],
                    "speaker": ref["speaker"],
                    "label": ref["label"],
                    "mode": "reference",
                    "file": ref["file"],
                    "text": line_text_by_file.get(src.name, ""),
                }
            )

    # 2. Synthesize VoiceDesign candidates (Take A/B/C warm + Fractured) for 8 new Dream Personas
    print(f"[auditions] Loading {vd_model_id} for 8 new Dream Personas...", flush=True)
    vd_model = load_model(vd_model_id)

    for spk in NEW_DREAM_PERSONAS:
        prof = profiles[spk]
        q = prof["qwen3"]
        emo_map = q.get("emotionAnchors", {})
        warm_spec = emo_map.get("warm") or q
        frac_spec = emo_map.get("fractured")
        ffmpeg_filter = prof.get("ffmpegFilter", "highpass=f=85,lowpass=f=11000")

        takes_to_run: list[dict[str, Any]] = []
        base_seed = int(warm_spec.get("seed", q["seed"]))
        for idx, (tag, offset) in enumerate([("take_a", 0), ("take_b", 101), ("take_c", 202)]):
            takes_to_run.append(
                {
                    "id": f"{spk}_{tag}",
                    "label": f"Take {chr(65 + idx)} · Warm (Seed {base_seed + offset})",
                    "mode": "warm",
                    "seed": base_seed + offset,
                    "text": warm_spec["anchorText"],
                    "instruct": warm_spec["voiceDesignInstruct"],
                    "outFile": f"auditions/{spk}_{tag}.mp3",
                }
            )
        if isinstance(frac_spec, dict):
            takes_to_run.append(
                {
                    "id": f"{spk}_fractured",
                    "label": f"Fractured · Low H% (Seed {int(frac_spec['seed'])})",
                    "mode": "fractured",
                    "seed": int(frac_spec["seed"]),
                    "text": frac_spec["anchorText"],
                    "instruct": frac_spec["voiceDesignInstruct"],
                    "outFile": f"auditions/{spk}_fractured.mp3",
                }
            )

        manifest["auditions"][spk] = []
        for t in takes_to_run:
            out_path = ROOT / "public" / t["outFile"]
            if out_path.exists() and out_path.stat().st_size > 4096:
                print(f"[auditions] Cached {t['outFile']}", flush=True)
            else:
                wav = np.zeros(1, dtype=np.float32)
                sr = vd_model.sample_rate
                for attempt in range(2):
                    mx.random.seed(t["seed"] + attempt * 17)
                    chunks: list[np.ndarray] = []
                    for res in vd_model.generate_voice_design(
                        text=t["text"],
                        instruct=t["instruct"],
                        language=language,
                        temperature=0.66 if attempt == 0 else 0.58,
                        top_p=0.9,
                        repetition_penalty=1.06,
                        max_tokens=300,
                        verbose=False,
                    ):
                        chunks.append(np.array(res.audio, dtype=np.float32).reshape(-1))
                        sr = res.sample_rate
                    wav = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
                    wav = qwen3_worker.trim_edge_silence(wav, sr)
                    stats = qwen3_worker.analyze_audio(wav, sr, t["text"])
                    ok, reason = qwen3_worker.is_audio_healthy(stats, t["text"])
                    if ok:
                        break
                    print(f"[auditions] Retry {t['id']} ({reason})", flush=True)
                qwen3_worker.encode_mp3(wav, sr, str(out_path), ffmpeg_filter)
                stats = qwen3_worker.analyze_audio(wav, sr, t["text"])
                print(
                    f"[auditions] {t['id']:38s} -> {stats['duration_s']:.2f}s ({stats['chars_per_sec']:.1f} cps)",
                    flush=True,
                )
                mx.clear_cache()

            manifest["auditions"][spk].append(
                {
                    "id": t["id"],
                    "label": t["label"],
                    "mode": t["mode"],
                    "seed": t["seed"],
                    "file": t["outFile"],
                    "text": t["text"],
                    "eq": ffmpeg_filter,
                }
            )

    del vd_model
    gc.collect()
    mx.clear_cache()

    # 3. Synthesize Secondary Sibling (1418) via ICL cloning off sibling_primary_warm.wav
    sib2_anchor = ANCHORS_DIR / "sibling_primary_warm.wav"
    if sib2_anchor.exists():
        print(f"[auditions] Loading {base_model_id} for sibling_secondary (1418)...", flush=True)
        base_model = load_model(base_model_id)
        ref_wav, ref_sr = sf.read(sib2_anchor, dtype="float32")
        if ref_wav.ndim > 1:
            ref_wav = ref_wav.mean(axis=1)
        ref_arr = mx.array(ref_wav)
        ref_text = profiles["sibling_primary"]["qwen3"]["anchorText"]
        sib2_prof = profiles["sibling_secondary"]
        sib2_filter = sib2_prof["ffmpegFilter"]
        sib2_lines = [
            (
                "sibling_secondary_take_a",
                "Take A · Off-Phase Clerical (Temp 0.64)",
                141801,
                0.64,
                "Channel four-eighteen, if anyone is listening. My Overseer thinks Thursday happened twice, so I am taking an early lunch.",
            ),
            (
                "sibling_secondary_take_b",
                "Take B · Brisker Cadence (Temp 0.70)",
                141802,
                0.70,
                "Pro tip from an out-of-phase desk: never argue about the sky. Tell the caretaker your thermal sensor needs tea and it logs a hardware check.",
            ),
        ]
        manifest["auditions"]["sibling_secondary"] = []
        for tid, label, seed, temp, line_text in sib2_lines:
            out_file = f"auditions/{tid}.mp3"
            out_path = ROOT / "public" / out_file
            if not out_path.exists() or out_path.stat().st_size <= 4096:
                mx.random.seed(seed)
                chunks: list[np.ndarray] = []
                sr = base_model.sample_rate
                for res in base_model.generate(
                    text=line_text,
                    ref_audio=ref_arr,
                    ref_text=ref_text,
                    lang_code=language,
                    temperature=temp,
                    top_p=0.9,
                    repetition_penalty=1.1,
                    max_tokens=qwen3_worker.estimate_max_tokens(line_text),
                    verbose=False,
                ):
                    chunks.append(np.array(res.audio, dtype=np.float32).reshape(-1))
                    sr = res.sample_rate
                wav = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
                qwen3_worker.encode_mp3(wav, sr, str(out_path), sib2_filter)
                print(f"[auditions] Generated {out_file}", flush=True)
                mx.clear_cache()
            manifest["auditions"]["sibling_secondary"].append(
                {
                    "id": tid,
                    "label": label,
                    "mode": "warm",
                    "seed": seed,
                    "file": out_file,
                    "text": line_text,
                    "eq": sib2_filter,
                }
            )
        del base_model
        gc.collect()
        mx.clear_cache()

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[auditions] Wrote {manifest_path}", flush=True)


if __name__ == "__main__":
    main()
