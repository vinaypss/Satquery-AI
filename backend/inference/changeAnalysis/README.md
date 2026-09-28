# SatQuery AI — Remote Sensing Bi-Temporal Change Analysis Service
**SIH26167 | ISRO / Department of Space | Team IMPOSTERS**

> **GPU verification status: PENDING.** Architecture, integration, worker tests, and server tests are complete, but a real NVIDIA-CUDA inference forward pass has not yet been recorded as verification evidence. No simulated or placeholder change maps are ever shown.

## Overview
This standalone Python microservice provides pixel-level binary change detection for co-registered bi-temporal optical satellite imagery pairs using **TinyCD** (Lightweight Bi-Temporal Change Detection).

## Architecture & Baseline Specification
- **Model ID**: TinyCD (Lightweight Bi-Temporal Change Detection)
- **Checkpoints**: `TinyCD-LEVIR_CD.pth` / `TinyCD-WHU_CD.pth`
- **Architecture**: Siamese Feature Difference Network (~315K parameters)
- **Task Capability**: Pixel-level binary change detection (changed vs. unchanged) between co-registered bi-temporal optical image pairs (t1 != t2)
- **Default Port**: 8004 (configurable via `CHANGE_ANALYSIS_WORKER_PORT`)
- **Supported Modality**: OPTICAL image pairs with distinct acquisition dates (t1 != t2)

## Endpoints
| Method | Endpoint | Description |
|---|---|---|
| GET, POST | /health or /v1/health | Diagnostic status of worker process and hardware |
| GET | /v1/readiness | Strict model readiness state (RUNNABLE, GPU_UNAVAILABLE, MODEL_UNAVAILABLE) |
| POST | /v1/load-model | Explicitly loads model weights into GPU VRAM |
| POST | /v1/change-analysis | Bi-temporal change detection forward pass returning base64 PNG change map and statistics |

## Files
- `worker.py` — HTTP inference worker
- `test_worker.py` — worker test suite
- `verify_change_inference.py` — real CUDA forward-pass verification script
- `run_colab_verification.py` — Tesla T4 Colab verification entrypoint

## Truthfulness & Model Integrity (SIH26167)
- Requires two valid remote-sensing images with distinct acquisition dates (t1 != t2).
- Strictly rejects single-image inputs or geographically mismatched scenes.
- Never fabricates simulated change maps, placeholder arrays, or synthetic change percentages.
- On non-CUDA hosts, returns HTTP 503 (`GPU_UNAVAILABLE` / model not loaded).
- When model is loaded on CUDA, executes a genuine Siamese forward pass and returns `provenance: "MODEL_GENERATED"`.

## Colab T4 Verification (Pending)
To execute the real forward pass on an NVIDIA Tesla T4 GPU and produce `verification_evidence.json` with genuine change-detection metrics:

```bash
python inference/changeAnalysis/verify_change_inference.py   # or run_colab_verification.py
```

This remains **pending** until real GPU inference evidence is recorded.