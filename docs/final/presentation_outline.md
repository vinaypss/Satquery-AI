# SatQuery AI — SIH Final Presentation Outline

**Project:** SatQuery AI — An Interactive Vision-Language Assistant for Multimodal Remote Sensing Image Analysis through Text Queries
**Problem Statement:** SIH26167 (ISRO / Department of Space — Space Technology, Software)
**Team:** IMPOSTERS
**Source of truth:** Current repository + `docs/final/SatQuery_AI_Technical_Report.md` (Phase 15.1) + real verification evidence files under `backend/inference/*/verification_evidence.json`.

---

## Status Legend
| Tag | Meaning |
|---|---|
| IMPLEMENTED | Code exists and is wired into the application. |
| REAL INFERENCE VERIFIED | A genuine model forward pass was recorded with `MODEL_GENERATED` provenance on a real GPU + real satellite image. |
| TESTED | Covered by automated regression tests. |
| NOT ACCURACY VALIDATED | Execution verified, but no ground-truth accuracy benchmark. |
| PENDING | Implementation/verification not yet complete. |
| RESEARCH / FALLBACK | Architecture exists; treated as unveriwed baseline or fallback path. |
| FUTURE SCOPE | Designed but not implemented in the current repository. |

---

## Slide-by-Slide Outline (14 slides, target 10–15)

### Slide 1 — Title
- SatQuery AI
- SIH26167 · ISRO / Department of Space · Team IMPOSTERS
- "An Interactive Vision-Language Assistant for Multimodal Remote-Sensing Image Analysis through Text Queries"

### Slide 2 — Problem Statement
- Analysts must manually pick model after model for each remote-sensing task (detection, segmentation, change, captioning).
- Each model has its own input format, lifecycle, and failure behavior — no unified workflow.
- The current project implements a **query-driven** assistant: a user asks a question, the system validates imagery, parses intent, routes to the right specialist, and returns evidence-grounded output.

### Slide 3 — Why Current Remote-Sensing Analysis Is Difficult
- Multi-format imagery: optical, multispectral, SAR — each needs different handling.
- Specialist models are fragmented (VQA, caption, grounding, segmentation, change detection, optical+SAR fusion).
- No common language between analyst intent and model capability.
- Manual integration is time-consuming and error-prone; results are hard to trust without provenance.

### Slide 4 — Proposed Solution + Core Innovation
- **Proposed solution:** an agentic orchestration layer over a controlled specialist model registry.
- **Core innovation:**
  1. Deterministic natural-language parse → intent + target extraction (STAGE 3, IMPLEMENTED + TESTED).
  2. Task × image-pair compatibility validation before any model runs (STAGE 4, IMPLEMENTED + TESTED).
  3. Evidence-first, zero-fabrication execution: when a model/GPU is unavailable the system truthfully reports `failed`/`rejected` with a stated reason and `evidenceType: "none"` (IMPLEMENTED + TESTED).

### Slide 5 — System Architecture
- React + Vite + Tailwind v4 frontend (`frontend/client/`) — GIS-style workspace: LeftInputPanel, CenterImageViewer (zoom, grid, crosshair, overlays), RightAnalysisPanel, BottomEvidencePanel, ResultReportCard, STACDiscoveryModal.
- Express + TypeScript backend (`backend/server/`) — `/api` routes, validation, agent parser/router, 6 specialist adapters, model audit, STAC catalog, evidence export.
- `backend/inference/` — independent Python GPU worker microservices (GeoChat :8088, Grounding :8002, SegFormer :8003, TinyCD :8004, Optical-SAR :8005).
- All status IMPLEMENTED; GPU verification per model (see Slide 12).

### Slide 6 — End-to-End Workflow
```
Upload/Ingest → Validate (magic bytes, format, ≤25 MB, modality)
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

### Slide 7 — Location / Data Discovery
- **IMPLEMENTED:** Copernicus CDSE STAC live discovery (`/api/catalog/search`, `/api/catalog/collections`).
  - Collections: `sentinel-2-l2a`, `sentinel-2-l1c`, `sentinel-1-grd`, `sentinel-1-slc`.
  - Deterministic 4-tier ranking: bbox overlap %, cloud cover, date-midpoint proximity, item ID.
  - Truthful zero-result and upstream-error handling (TESTED, 40 assertions).
- **FUTURE SCOPE (Phase 16, NOT implemented):** location geocode → interactive map → AOI drawing. The current repository has **no** map/GIS library and **no** NASA integration; `NASA_API_KEY` in `.env` is unused. Present only as roadmap.

### Slide 8 — Natural-Language Query Understanding + Agentic Routing
- Deterministic parser (`backend/server/agent/queryParser.ts`) — remote-sensing lexicon, intent + target extraction (TESTED, 15 assertions).
- Agentic router (`backend/server/agent/router.ts`) — task assignment + modality/image-pair compatibility validation (TESTED, 18 assertions).
- API: `/api/parse-query`, `/api/route-task`.

### Slide 9 — Specialist Model Stack
| Specialist | Model | Status |
|---|---|---|
| VQA | GeoChat-7B | conditionally_suitable · REAL INFERENCE VERIFIED (T4) |
| Caption | GeoChat-7B (description mode) | conditionally_suitable · REAL INFERENCE VERIFIED (T4) |
| Grounding | Grounding DINO Tiny (zero-shot baseline) | conditionally_suitable · REAL INFERENCE VERIFIED (T4) |
| Segmentation | SegFormer-B0 (ADE20K general baseline) | conditionally_suitable · REAL INFERENCE VERIFIED (T4) — accuracy NOT VALIDATED |
| Change Analysis | TinyCD | unverified · GPU verification PENDING |
| Optical + SAR | Dual-Stream Fusion | research_only · GPU verification PENDING |

### Slide 10 — Evidence / Provenance + Zero-Fabrication
- Every report carries `provenanceChain` with `evidenceFabricated: false` and `sihCompliance.zeroFabricatedEvidence: true`.
- `GET /api/model-audit` (Stage 6A) exposes the authoritative capability matrix; unknown task types return truthful 404.
- Evidence export audits georeferencing: GeoJSON (RFC 7946) only for valid WGS84 georeferencing; otherwise image-space JSON with explicit NON-GEOGRAPHIC disclaimer.
- Offline/GPU-unavailable behavior truthfully reports unavailability instead of fabricating output.

### Slide 11 — Security Architecture
- Authentication: Bearer API-key gate (`requireApiKey`) on `/api/*` (health exempt).
- Authorization / IDOR protection: no object-ID choice endpoints; controlled specialist registry; single-analysis orchestration (Phase 2, TESTED 42 assertions).
- Rate limiting: tiered fixed-window (`inference` / `upload` / `external` / `general`), per-IP + per-credential (Phase 4, TESTED 22 assertions).
- Secret handling: server-side env only; no `VITE_*` secrets; `.env*` gitignored; no key exposure in client code.
- Input validation: magic-byte, format, ≤25 MB, sanitization, filename traversal/injection rejection, SSRF-hardened STAC client (Phase 6, TESTED 54 assertions).
- Deployment: CSP, HSTS, CORS allowlist, HTTPS enforcement, request IDs, JSON 404/error handlers, production readiness warnings (Phase 3, TESTED 43 assertions).

### Slide 12 — Real Verification Evidence (Status Table)
| Capability | Implemented | Real inference verified | Accuracy validated | Current note |
|---|---|---|---|---|
| Image validation | YES | — | — | TESTED |
| NL query parsing | YES | — | — | TESTED |
| Agentic routing + compatibility | YES | — | — | TESTED |
| VQA (GeoChat-7B) | YES | YES — T4, real Sentinel-2, 11,738 ms, MODEL_GENERATED | **NOT VALIDATED** | `backend/inference/geochat/verification_evidence.json` |
| Caption (GeoChat-7B) | YES | YES — T4, real Sentinel-2, 7,594 ms, MODEL_GENERATED | **NOT VALIDATED** | same evidence file |
| Grounding (Grounding DINO Tiny) | YES | YES — T4, score 0.8433559, 284 ms | **NOT VALIDATED** | `backend/inference/grounding/verification_evidence.json` |
| Segmentation (SegFormer-B0) | YES | YES — T4, real Sentinel-2, 5,692 pixels, conf 0.2311 | **NOT VALIDATED** | `backend/inference/segmentation/verification_evidence.json` + mask PNG |
| Change Analysis (TinyCD) | YES (adapter/worker code) | NO — GPU proof PENDING | NO | marked `unverified` |
| Optical-SAR fusion | YES (research worker) | NO — PENDING | NO | `research_only`, no verified checkpoint |
| CDSE STAC discovery | YES | YES (live API) | — | TESTED, 40 assertions |
| Evidence export / provenance | YES | — | — | TESTED, 64 assertions |
| Model audit | YES | — | — | TESTED, ~27 assertions |
| Unified `/api/analyze` pipeline | YES | — | — | TESTED, 100 assertions E2E |

### Slide 13 — Testing and Validation
- `npm test`: 20 chained suites, ~562+ assertions — all green (last run: Phase 2 authZ/IDOR 42/42, Phase 3 deployment 43/43, Phase 4 abuse 22/22, Phase 6 input 54/54, Stage 7 reporting 100/100).
- `npm run lint` (`tsc --noEmit`): clean.
- `npm run build` (Vite client + esbuild `dist/server.cjs`): succeeds.
- Real-T4 evidence files are committed and loadable via `/api/model-audit`.

### Slide 14 — Demo, Results, Limitations, Future Scope, Thank-You
- **Demo scenarios (see `demo_script.md`):** offline full-pipeline demo (validation → parse → route → truthful unavailability), live CDSE STAC scene discovery, and optional live T4 inference replay from committed evidence.
- **Results actually supported by evidence:** only those on Slide 12 — real forward passes with `MODEL_GENERATED` provenance; no accuracy percentages.
- **Limitations:** no accuracy validation vs ground truth; TinyCD and Optical-SAR lack recorded GPU evidence; models are general-purpose baselines; no interactive map yet.
- **Future scope (Phase 16):** location search → interactive map → AOI selection → STAC scene discovery → spatial result overlays; NASA imagery (currently unused key).
- **Closing:** Thank you / Q&A.

---

## Visual Style Notes
- Clean GIS/remote-sensing language; use the committed segmentation mask PNG (`backend/inference/segmentation/segmentation_real_sentinel2_building_mask.png`) as visual evidence.
- Small amounts of text per slide; tables for status.
- Distinguish **VERIFIED** vs **NOT ACCURACY VALIDATED** vs **PENDING** visibly (color/green vs amber vs gray).
- No fabricated screenshots — only real app UI states and committed evidence artifacts may be shown.

## Claims Strictly Forbidden in Slides
- Any accuracy/benchmark percentage not present in a `verification_evidence.json`.
- "NASA integration" — NASA is unused.
- "Interactive map / AOI" as completed — Phase 16 is FUTURE SCOPE.
- "Optical-SAR / TinyCD verified" — no recorded GPU evidence.
- Latency numbers other than the recorded ones (`backend/inference/geochat`, `backend/inference/grounding` evidence files).