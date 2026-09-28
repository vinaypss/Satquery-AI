# SatQuery AI

**Problem Statement:** SIH26167
**Title:** SatQuery AI - An Interactive Vision-Language Assistant for Multimodal Remote Sensing Image Analysis through Text Queries
**Organization:** Indian Space Research Organisation (ISRO)
**Theme:** Space Technology
**Category:** Software
**Team Name:** IMPOSTERS

---

## 1. Project Overview

SatQuery AI is an interactive vision-language assistant for multimodal remote-sensing image analysis driven by natural-language queries. The system is designed to allow researchers and analysts to upload satellite/remote-sensing imagery (optical, multispectral, and SAR) and perform analytical workflows through natural-language questions such as:

- *"Where are the buildings?"* (Grounding / Localization)
- *"Describe this satellite image."* (Scene Captioning)
- *"Find the runway."* (Target Identification)
- *"What changed between these two images?"* (Bi-Temporal Change Analysis)
- *"Compare optical and SAR imagery."* (Cross-Modal Complementary Analysis)

Rather than requiring manual model selection, SatQuery AI introduces agentic, query-driven orchestration: it validates imagery inputs, parses user intent, matches requests to a controlled registry of specialist remote-sensing models, and returns evidence-grounded textual and visual outputs.

### Core SIH26167 Integrity Guarantee
- **Zero hallucination / zero fabrication.** No mock, synthetic, or placeholder answers, bounding boxes, masks, change maps, or fusion metrics are ever returned.
- When a worker or CUDA GPU is unavailable, execution **truthfully** reports `failed` / `rejected` with a stated reason and `evidenceType: "none"` — the application remains fully usable offline.
- Every pipeline run records `evidenceFabricated: false` in the report provenance chain.

---

## 2. Implemented Features

| Area | Status |
|---|---|
| Satellite image ingestion & validation (magic bytes, format, 25 MB limit) | **Implemented** |
| Natural-language query parsing / remote-sensing lexicon (Stage 3) | **Implemented** |
| Agentic task router + modality / image-pair compatibility validation (Stage 4) | **Implemented** |
| Six specialist adapters: VQA, Caption, Grounding, Segmentation, Change Analysis, Optical-SAR (Stage 5/6) | **Implemented** |
| Stage 6A specialist model-capability & hardware audit | **Implemented** |
| Stage 7 unified analysis pipeline & truthful result reporting | **Implemented** |
| Evidence export with georeferencing audit (GeoJSON vs. image-space JSON) | **Implemented** |
| Copernicus CDSE STAC satellite discovery (Phase 4) | **Implemented** |
| Independent Python GPU inference workers under `backend/inference/` | **Implemented** (see verification status below) |
| Full GIS workspace UI (viewport overlays, evidence panel, model audit, report card) | **Implemented** |

### Processing Pipeline

```
Upload / Ingest → Validate (magic bytes, size, modality)
        ↓
Query Parsing (deterministic intent & target extraction)
        ↓
Agentic Routing + Compatibility Validation (task × image pair)
        ↓
Specialist Execution (6 adapters; safe stop when model/GPU unavailable)
        ↓
Unified ResultReport (status, metrics, provenance, anti-fabrication guarantees)
        ↓
Evidence Export Audit (GeoJSON when georeferenced; image-space JSON otherwise)
```

---

## 3. Project Architecture

```
satquery-ai/
├── frontend/                          # React + Tailwind v4 frontend
│   ├── client/
│   │   ├── components/
│   │   │   ├── Header.tsx                # Status header + backend health monitor
│   │   │   ├── LeftInputPanel.tsx        # Upload / drag-drop, query input, STAC launcher
│   │   │   ├── CenterImageViewer.tsx     # GIS viewport: zoom, grid, crosshair, overlays
│   │   │   ├── RightAnalysisPanel.tsx    # Routing, execution contract & audit inspector
│   │   │   ├── BottomEvidencePanel.tsx   # Evidence / Metadata / Execution / Model Audit tabs
│   │   │   ├── ResultReportCard.tsx      # Report card + Download JSON / Export Evidence
│   │   │   └── STACDiscoveryModal.tsx    # Copernicus CDSE scene search & ingest
│   │   ├── pages/WorkspacePage.tsx       # Three-pane GIS workstation layout
│   │   ├── styles/gis.css                # GIS grid / crosshair utilities, scrollbars
│   │   └── types/index.ts                # Client state & evidence interfaces
│   └── src/                           # Vite app root (App.tsx, main.tsx, index.css)
├── backend/
│   ├── server/                        # Express backend
│   │   ├── index.ts                   # App factory & route mounting
│   │   ├── agent/
│   │   │   ├── queryParser.ts         # Stage 3 deterministic NL query parser
│   │   │   ├── router.ts              # Stage 4 agentic router + compatibility checks
│   │   │   └── resultAggregator.ts    # Stage 7 ResultReport / provenance builder
│   │   ├── catalog/stacService.ts     # Phase 4 Copernicus CDSE STAC client (SSRF-hardened)
│   │   ├── routes/                    # health, validate-image, parse-query, route-task,
│   │   │                              # execute-task, model-audit, catalog, analyze
│   │   ├── tools/                     # specialist registry + 6 adapters + configs,
│   │   │                              # modelAudit.ts, exportEvidence.ts
│   │   ├── validation/                # imageValidator.ts, compatibilityValidator.ts
│   │   └── types/                     # Shared server/client remote-sensing contracts
│   ├── inference/                     # Independent Python GPU worker microservices
│   │   ├── geochat/                   # GeoChat-7B VQA/caption worker (:8088)
│   │   ├── grounding/                 # Grounding DINO Tiny worker (:8002) + T4 evidence
│   │   ├── segmentation/              # SegFormer-B0 worker (:8003) — REAL INFERENCE VERIFIED on T4 (accuracy NOT VALIDATED)
│   │   ├── changeAnalysis/            # TinyCD worker (:8004) — GPU verification pending
│   │   └── opticalSar/                # Optical-SAR fusion worker (:8005) — GPU verification pending
│   └── scripts/verify-stac.ts         # STAC catalog verification script
├── docs/                              # Design docs + final phase deliverables
├── index.html                         # Vite SPA shell
├── server.ts                          # Unified full-stack entry (Express + Vite / static)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 4. Backend API Reference

All endpoints are mounted under `/api` on port 3000 and accept JSON bodies (limit 50 MB).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend health (`{ status, service, stage, timestamp }`). |
| `POST` | `/api/validate-image` | Magic-byte / format / size validation for an uploaded image. |
| `POST` | `/api/parse-query` | Deterministic natural-language query parsing. |
| `POST` | `/api/route-task` | Agentic routing + compatibility assessment (`{ valid, routingResult }`). |
| `POST` | `/api/execute-task` | Controlled specialist execution (`{ valid, output }`). |
| `GET` | `/api/model-audit` | Stage 6A model audit matrix + environment audit. Supports `?taskType=` for a single entry (404 if unknown). |
| `POST` | `/api/analyze` | End-to-end pipeline: parse → route → execute → unified `ResultReport`. |
| `POST` | `/api/analyze/export-evidence` | Audited evidence export (see §6). |
| `POST` | `/api/analyze/export-geojson` | Alias of `/export-evidence` (same audit contract). |
| `GET` | `/api/catalog/collections` | Supported Sentinel-2 / Sentinel-1 collections metadata. |
| `POST` | `/api/catalog/search` | Live Copernicus CDSE STAC scene search (bbox, dates, modality, cloud cover, limit). |

### Unified Analysis Report (`POST /api/analyze`)

Request:
```json
{
  "query": "Where are the buildings?",
  "images": [
    {
      "id": "img-primary",
      "name": "scene.png",
      "mimeType": "image/png",
      "sizeBytes": 1048576,
      "modality": "OPTICAL",
      "acquisitionDate": "2024-05-12",
      "geographicArea": "Delhi",
      "dataUri": "data:image/png;base64,..."
    }
  ]
}
```

Response `report` includes: `status` (`parse_failed` | `routing_failed` | `rejected` | `failed` | `complete`), parsed query, routing decision, specialist output, `pipelineMetrics` (`parseMs`, `routeMs`, `executeMs`, `totalMs`), `provenanceChain` (`evidenceFabricated: false`), `sihCompliance` (`zeroFabricatedEvidence: true`, `modelAuditRef: "SIH26167-STAGE6A"`), and `errorSummary` on failure/rejection.

---

## 5. Specialist Model Verification Status

Authoritative source: `backend/server/tools/modelAudit.ts` (exposed via `GET /api/model-audit`).

| Task | Specialist | Deployment Status | Real GPU Inference |
|---|---|---|---|
| VQA | GeoChat-7B | `conditionally_suitable` | **REAL INFERENCE VERIFIED** — real Tesla T4 (4-bit) forward pass on a real Sentinel-2 L2A scene (696×564): answer returned in 11,738 ms, `MODEL_GENERATED` (`backend/inference/geochat/verification_evidence.json`). Local host CPU-only (inference unavailable). Answer accuracy: **NOT VALIDATED** |
| Caption | GeoChat-7B (Scene Description Mode) | `conditionally_suitable` | **REAL INFERENCE VERIFIED** — same T4 run: scene caption (+ raw grounding tokens) in 7,594 ms, `MODEL_GENERATED` (`backend/inference/geochat/verification_evidence.json`). Caption accuracy: **NOT VALIDATED** |
| Grounding | Grounding DINO Tiny (zero-shot baseline) | `conditionally_suitable` | **VERIFIED** — real Tesla T4 benchmark, score `0.8433559`, `MODEL_GENERATED` (`backend/inference/grounding/verification_evidence.json`) |
| Segmentation | SegFormer-B0 (ADE20K general baseline) | `conditionally_suitable` | **REAL INFERENCE VERIFIED** — real Tesla T4 forward pass on a real Sentinel-2 L2A scene (696×564, target `building`): **5,692 segmented pixels**, confidence `0.2311`, `MODEL_GENERATED` (`backend/inference/segmentation/verification_evidence.json` + mask PNG). Accuracy/RS specialization: **NOT VALIDATED** |
| Change Analysis | TinyCD | `unverified` | **GPU verification pending** |
| Optical-SAR | Dual-Stream Multimodal Optical-SAR Fusion | `research_only` | **GPU verification pending** |

> **GPU verification pending** means worker architecture, integration, worker tests, and server tests are complete, but a real NVIDIA-CUDA inference forward pass has **not** yet been recorded as verification evidence. No simulated change maps or fusion metrics are shown until genuine GPU evidence exists.

> **Evidence provenance:** Real-T4 evidence files in this repository: **Grounding DINO** (score `0.8433559`, `backend/inference/grounding/verification_evidence.json`), **Segmentation SegFormer-B0** (real Sentinel-2 run, 5,692 pixels, `backend/inference/segmentation/verification_evidence.json` + mask PNG), and **GeoChat-7B VQA/Caption** (real Sentinel-2 run, VQA 11,738 ms + caption 7,594 ms, `backend/inference/geochat/verification_evidence.json`). All carry `MODEL_GENERATED` provenance with `synthetic_output: false`. Answer/caption/mask accuracy against ground truth is **NOT VALIDATED** for any specialist.

SegFormer-B0 and Grounding DINO are general-purpose baselines; their remote-sensing capability is evaluated via baseline / zero-shot transfer only.

---

## 6. Evidence Export & Geospatial Integrity

`POST /api/analyze/export-evidence` audits evidence before export (`backend/server/tools/exportEvidence.ts`):

- Pixel and normalized image coordinates are **never** presented as latitude/longitude.
- Standard **GeoJSON (RFC 7946)** is produced **only** when valid image georeferencing exists — a WGS84 bbox derived from `image.coordinates`, `image.metadata.bbox`, or STAC-style `geographicArea: "BBox: [lon,lat,lon,lat]"`. The degenerate unit box `[0,0,1,1]` is rejected.
- Without valid georeferencing, evidence is exported as **image-space JSON** marked `isGeographic: false`, `coordinateSystem: "normalized_image_space"`, with an explicit NON-GEOGRAPHIC disclaimer.
- Response discriminators: `{ valid, isGeographic, exportFormat: "geojson" | "image_space_json", geoJson?, imageSpaceEvidence?, georeferencing? }`.

The UI ("Export Evidence" button in `ResultReportCard`) downloads a `.geojson` file when geographic, otherwise `*_image_space.json`.

---

## 7. Satellite Data Discovery (Phase 4 — STAC)

SatQuery AI queries the live **Copernicus Data Space Ecosystem (CDSE)** STAC API (`https://stac.dataspace.copernicus.eu/v1/`) — no local mock dataset. See `docs/PHASE_4_DATA_STRATEGY.md` for the full design.

- Supported collections: `sentinel-2-l2a`, `sentinel-2-l1c`, `sentinel-1-grd`, `sentinel-1-slc`.
- Deterministic 4-tier ranking: bbox overlap %, cloud cover, date-midpoint proximity, item ID.
- SSRF hardening: locked CDSE base URL, domain allowlist, loopback/private-IP rejection.
- Truthful zero-result (`status: "no_results"`, empty `results`) and upstream-error (502/504) handling.

---

## 8. Automated Tests

Full regression suite: `npm test` — **20 chained test suites**:

| Test file | Assertions |
|---|---|
| `backend/server/validation/imageValidator.test.ts` | 12 |
| `backend/server/agent/queryParser.test.ts` | 15 |
| `backend/server/agent/router.test.ts` | 18 |
| `backend/server/tools/specialistAdapter.test.ts` | 21 |
| `backend/server/tools/modelAudit.test.ts` | ~27 |
| `backend/server/tools/exportEvidence.test.ts` | 64 |
| `backend/server/tools/vqa.test.ts` | 19 |
| `backend/server/tools/caption.test.ts` | 24 |
| `backend/server/tools/grounding.test.ts` | 22 |
| `backend/server/tools/segmentation.test.ts` | 18 |
| `backend/server/tools/changeAnalysis.test.ts` | 20 |
| `backend/server/tools/opticalSar.test.ts` | 21 |
| `backend/server/catalog/stacService.test.ts` | 40 |
| `backend/server/integration/fullSpecialistIntegration.test.ts` | 98 |
| `backend/server/tools/resultAggregator.test.ts` | 43 |
| `backend/server/security/accessControl.test.ts` (authZ/IDOR) | 42 |
| `backend/server/security/production.test.ts` (deployment) | 43 |
| `backend/server/security/abuseProtection.test.ts` | 22 |
| `backend/server/security/inputValidation.test.ts` | 54 |
| `backend/server/integration/analyze_e2e.test.ts` | 100 |

Quality gates:

```bash
npm install          # install dependencies
npm run lint         # TypeScript strict type-check (tsc --noEmit)
npm run build        # Vite client bundle + esbuild server bundle
npm test             # full regression suite
```

---

## 9. Deployment

### Prerequisites
- Node.js v18+ and npm v9+
- Python 3.10+ (only required for the optional GPU inference workers)

### Local Development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

### Production Build & Start

```bash
npm run build        # → dist/ (client) + dist/server.cjs (server)
npm start            # serves dist/ + API on port 3000
```

### Optional GPU Inference Workers

Each worker under `backend/inference/` is a standalone Python HTTP service (`worker.py` + `requirements.txt`). The Node backend calls it only when real inference is requested; when the worker/GPU is offline the adapter truthfully reports `failed`/`rejected` with the stated reason (HTTP 503 upstream contracts documented in each worker README).

| Worker | Default Port | Env Vars |
|---|---|---|
| GeoChat-7B | 8088 | `GEOCHAT_WORKER_URL`, `GEOCHAT_MODEL`, `GEOCHAT_AUTH_KEY`, `GEOCHAT_DEVICE`, `GEOCHAT_LOAD_MODE`, `GEOCHAT_MAX_NEW_TOKENS`, `GEOCHAT_TEMPERATURE`, `GEOCHAT_TIMEOUT_MS` |
| Grounding DINO Tiny | 8002 | `GROUNDING_WORKER_URL`, `GROUNDING_AUTH_KEY` (or `GEOCHAT_AUTH_KEY`) |
| SegFormer-B0 | 8003 | `SEGMENTATION_WORKER_URL` |
| TinyCD | 8004 | `CHANGE_ANALYSIS_WORKER_URL` |
| Optical-SAR Fusion | 8005 | `OPTICAL_SAR_WORKER_URL` |

Example (Grounding worker):

```bash
cd backend/inference/grounding
pip install -r requirements.txt
python worker.py --port 8002
# Set GROUNDING_WORKER_URL=http://127.0.0.1:8002 in the SatQuery backend environment.
```

Example (GeoChat worker on Colab T4):

```bash
!pip install -q torch torchvision transformers accelerate bitsandbytes pillow requests
!python worker.py --port 8000 --load-mode 4bit
!npx localtunnel --port 8000
# export GEOCHAT_WORKER_URL="https://your-tunnel-url.loca.lt"
```

---

## 10. Development Roadmap / Pending Work

- GeoChat-7B (VQA/Caption) real inference is VERIFIED on Colab T4 (evidence recorded); answer/caption accuracy validation against ground truth remains open.
- **GPU verification pending:** Change Analysis (TinyCD), Optical-SAR fusion (`research_only`). Segmentation SegFormer-B0 real inference is VERIFIED (accuracy NOT VALIDATED).
- Worker services require an external tunnel (ngrok / Cloudflare Tunnel / localtunnel) when running cross-environment.