# SatQuery AI — GeoChat-7B Specialist Worker (Stage 6B)
**SIH26167 | ISRO Space Technology | Theme: Space Technology**

This directory contains the independent Python inference worker for **MBZUAI/geochat-7B**, the remote-sensing visual question answering specialist identified during the Stage 6A capability audit.

---

## 1. Architecture Overview

```
SatQuery Backend (Node/Express)
          ↓ (HTTP POST /v1/vqa)
GeoChat Worker Service (inference/geochat/worker.py)
          ↓
MBZUAI/geochat-7B (4-bit NF4 quantized via BitsAndBytes)
          ↓
Evidence-Grounded VQA Answer Text
```

Per SIH26167 constraints:
- Heavy Python ML dependencies are **not** bundled into the Node `package.json`.
- The Node application remains responsive and completely usable even when the worker is offline.
- When the worker or CUDA GPU is unavailable, a **truthful blocked/error status** is returned; no simulated, synthetic, or placeholder answers are fabricated.

---

## 2. Environment Differentiation & Verification Status

### Status:
- **Architecture and integration:** COMPLETE
- **Automated server tests:** PASS (19/19 VQA tests; 16-suite full regression, ~560 assertions via `npm test`)
- **Real GeoChat inference:** VERIFIED on NVIDIA Tesla T4 (evidence: `verification_evidence.json`, `MODEL_GENERATED`; answer/caption accuracy NOT VALIDATED)

### Files
- `worker.py` — HTTP inference worker (`/v1/vqa`, `/v1/caption`, `/health`, `/v1/readiness`)
- `test_worker.py` — worker test suite
- `verify_geochat_inference.py` — real CUDA VQA verification script (Colab T4)
- `verify_caption_inference.py` — real CUDA caption verification script (Colab T4)
- `verification_evidence.json` — permanent real-T4 evidence record (real Sentinel-2 VQA + caption run, `MODEL_GENERATED`)

### Environments:
1. **AI Studio / Local Development Environment:**
   Real GeoChat inference is **unavailable** due to CPU-only execution (no NVIDIA CUDA GPU). Used for orchestrating pipelines, input compatibility validation, and automated regression testing.
2. **Google Colab T4 Environment:**
   Verified real-inference environment equipped with NVIDIA Tesla T4 GPU, CUDA support, and ~15 GB VRAM (4-bit NF4 bitsandbytes quantization). VQA + caption forward passes **verified** on a real Sentinel-2 L2A scene — see `verification_evidence.json` (`verification_id: satquery-geochat-7b-tesla-t4-real-sentinel2`; answer/caption accuracy NOT VALIDATED).

| Parameter | Minimum Requirement | Google Colab T4 (Candidate) | AI Studio / Local Dev |
|---|---|---|---|
| **GPU** | NVIDIA GPU with >= 15 GB VRAM | NVIDIA Tesla T4 (15.0 GB GDDR6) | Cloud Container vCPU / Intel Iris Xe (No CUDA) |
| **CUDA Support** | Required | Available (CUDA 12.x) | None (CPU only) |
| **Quantization** | 4-bit NF4 (`bitsandbytes`) | Supported (~5.5 GB VRAM footprint) | N/A (Unavailable) |
| **Inference Status** | — | Candidate (Not Yet Verified) | Real Inference Unavailable |
| **Integrity Guard** | SIH26167 Compliance | No fabricated answers | Safe stop, zero simulated responses |

---

## 3. Worker REST API Contract

### Health Check: `GET /health` or `GET /v1/health`
**Response (Non-CUDA Host):**
```json
{
  "status": "online",
  "cuda_available": false,
  "gpu_name": "None (No CUDA device found)",
  "total_vram_gb": 0.0,
  "available_vram_gb": 0.0,
  "model_loaded": false,
  "model_id": "MBZUAI/geochat-7B",
  "device": "cpu",
  "load_mode": "4bit",
  "message": "Host environment lacks NVIDIA CUDA GPU. GeoChat-7B requires >=15GB VRAM (e.g. Tesla T4)."
}
```

### VQA Inference: `POST /v1/vqa`
**Request:**
```json
{
  "task": "vqa",
  "image": {
    "name": "delhi_airport_optical.png",
    "mimeType": "image/png",
    "dataUri": "data:image/png;base64,..."
  },
  "question": "What primary infrastructure features are visible in this satellite imagery?",
  "parameters": {
    "maxNewTokens": 512,
    "temperature": 0.2
  }
}
```

**Response (When Model is Loaded on CUDA):**
```json
{
  "answerText": "The image reveals a commercial airport layout featuring two parallel paved runways, taxiway networks, multiple passenger terminal gates with jet bridges, and commercial aircraft parked on the apron.",
  "confidence": 0.0,
  "modelName": "MBZUAI/geochat-7B",
  "device": "cuda",
  "durationMs": 1820
}
```

**Response (When Blocked / CUDA Unavailable):**
```json
{
  "error": "GeoChat-7B model not loaded",
  "detail": "Host environment lacks NVIDIA CUDA GPU. Inference is blocked on non-CUDA environments.",
  "cuda_available": false,
  "hardware": "None (No CUDA device found)",
  "required": "NVIDIA Tesla T4 (>=15 GB VRAM) with 4-bit NF4 quantization",
  "model_id": "MBZUAI/geochat-7B"
}
```

---

## 4. Launching the Worker on Google Colab (Tesla T4)

1. Open a new Google Colab notebook with **T4 GPU** runtime (`Runtime > Change runtime type > T4 GPU`).
2. Run the installation:
   ```bash
   !pip install -q torch torchvision transformers accelerate bitsandbytes pillow requests
   ```
3. Clone or copy `inference/geochat/worker.py` and run:
   ```bash
   !python worker.py --port 8000 --load-mode 4bit
   ```
4. Expose the port using ngrok, Cloudflare Tunnel, or localtunnel:
   ```bash
   !npx localtunnel --port 8000
   ```
5. Set `GEOCHAT_WORKER_URL` in the SatQuery application:
   ```bash
   export GEOCHAT_WORKER_URL="https://your-tunnel-url.loca.lt"
   ```
