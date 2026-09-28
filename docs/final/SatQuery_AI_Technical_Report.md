# SatQuery AI — Technical Report

**Problem Statement:** SIH26167 — ISRO / Department of Space
**Title:** SatQuery AI — An Interactive Vision-Language Assistant for Multimodal Remote Sensing Image Analysis through Text Queries
**Theme:** Space Technology · **Category:** Software
**Team:** IMPOSTERS
**Report phase:** Final (Phase 15.1) — based on the current repository state and committed verification evidence.

---

## Status Legend Used in This Report

| Tag | Meaning |
|---|---|
| IMPLEMENTED | Code exists and is wired into the application. |
| REAL INFERENCE VERIFIED | A genuine model forward pass was recorded with `MODEL_GENERATED` provenance on a real GPU and, where stated, a real satellite image. |
| TESTED | Covered by automated regression tests (see §18). |
| NOT ACCURACY VALIDATED | Execution verified; no ground-truth accuracy benchmark. |
| PENDING | Implementation complete but real GPU inference evidence not yet recorded. |
| RESEARCH / FALLBACK | Architecture/candidate exists; treated as unverified baseline or fallback path. |
| FUTURE SCOPE | Designed but not present in the current repository. |

---

## 1. Executive Summary

SatQuery AI is a query-driven vision-language assistant for multimodal remote-sensing image analysis. A user uploads satellite/remote-sensing imagery (optical, multispectral, SAR), asks a natural-language question, and the system validates the input, parses intent, routes the request to one of six registered specialist models, and returns evidence-grounded textual and visual output.

The system is built around an **evidence-first integrity guarantee** (SH supporting SIH26167): no synthetic, mocked, or placeholder results are returned. When a model worker or GPU is unavailable, execution truthfully reports `failed`/`rejected` with a stated reason and `evidenceType: "none"`. Committed verification evidence under `backend/inference/*/verification_evidence.json` records real Tesla T4 forward passes for GeoChat-7B (VQA + caption), Grounding DINO Tiny, and SegFormer-B0 on real Sentinel-2 imagery — all with `MODEL_GENERATED` provenance and accuracy explicitly **NOT VALIDATED**.

The current repository is a complete, testable release candidate: 20 automated test suites pass, TypeScript strict type-checking is clean, and the production build (Vite + esbuild) succeeds.

## 2. Problem Statement

ISRO's requirement (SIH26167) is for software that makes satellite data analysis accessible through text queries. Analysts must currently select, configure, and glue together multiple specialist models (detection, segmentation, change detection, captioning, fusion) manually, and must individually reason about input compatibility, model availability, GPU constraints, and the trustworthiness of each output.

## 3. Existing Limitations / Motivation

- Specialist remote-sensing models are fragmented: VQA, captioning, grounding, segmentation, bi-temporal change, and optical+SAR fusion each require different runtimes, checkpoints, and hardware.
- Manual model selection is time-consuming and error-prone; wrong-task selection wastes compute.
- Results lack provenance: no integral record of *whether a model ran*, *which model ran*, and *whether the output was fabricated*.
- Multimodal input (optical, multispectral, SAR) makes naive pipelines fail at the boundaries (e.g., SAR passed to an optical-only model).

## 4. Solution Overview

SatQuery AI provides:

1. **Ingestion and validation** — magic-byte/format/size/modality checks before any processing.
2. **Natural-language understanding** — deterministic parser over a remote-sensing lexicon.
3. **Agentic task routing** — route query intent to a controlled registry of 6 specialist tools with task×image compatibility validation.
4. **Controlled execution** — each specialist adapter calls an independent Python GPU worker; failure is reported truthfully.
5. **Unified reporting** — one `ResultReport` with status, metrics, provenance chain, and anti-fabrication guarantees.
6. **Evidence export** — audited GeoJSON (when georeferenced) or image-space JSON otherwise.

## 5. System Architecture

```
frontend/client/          React + Vite + Tailwind v4 GIS-style workspace
frontend/src/             Vite app root (App.tsx, main.tsx, index.css)
backend/server/           Express + TypeScript backend
  agent/                  queryParser, router, resultAggregator
  catalog/                stacService (Copernicus CDSE client, SSRF-hardened)
  routes/                 health, validate-image, parse-query, route-task,
                          execute-task, model-audit, catalog, analyze
  security/               accessControl, secureDefaults, inputValidation, securityLogger
  tools/                  specialist registry + 6 adapters + configs + modelAudit + exportEvidence
  validation/             imageValidator, compatibilityValidator
  types/                  shared remote-sensing contracts
backend/inference/        independent Python GPU workers (GeoChat, Grounding,
                          Segmentation, ChangeAnalysis, OpticalSAR)
docs/final/               final technical report, presentation outline, demo script
```

## 6. End-to-End Workflow

```
Upload / Ingest → Validate (magic bytes, format ≤25 MB, modality)
        ↓
Query Parsing (deterministic intent & target extraction)
        ↓
Agentic Routing + Compatibility Validation (task × image pair)
        ↓
Specialist Execution (6 adapters; truthful stop when model/GPU unavailable)
        ↓
Unified ResultReport (status, metrics, provenance, anti-fabrication guarantees)
        ↓
Evidence Export Audit (GeoJSON when georeferenced; image-space JSON otherwise)
```

## 7. Input Validation and Compatibility Handling

- `backend/server/validation/imageValidator.ts`: magic-byte detection, MIME/extension allowlist (PNG, JPEG, WebP, TIFF), 25 MB default limit, modality tagging.
- `backend/server/validation/compatibilityValidator.ts`: enforces each specialist's expected image count, modality (e.g., SAR rejection for optical-only tasks), and temporal-pair requirements.
- Truthful rejection: incompatible requests produce structured `routing_failed`/`rejected` reports with explanations, never fabricated output.

## 8. Natural-Language Query Understanding

- `backend/server/agent/queryParser.ts`: deterministic parser with a remote-sensing lexicon mapping phrasing to task types (`vqa`, `caption`, `grounding`, `segmentation`, `change_analysis`, `optical_sar`) and extracting targets (e.g., "building", "runway").
- Exposure: `POST /api/parse-query`. TESTED (15 assertions).

## 9. Agentic Task Routing

- `backend/server/agent/router.ts`: assigns the task to a controlled specialist via `backend/server/tools/toolRegistry.ts` and runs compatibility validation. Ambiguity or incompatibility yields structured `routing_failed` contracts.
- Exposure: `POST /api/route-task`. TESTED (18 assertions).

## 10. Specialist Architecture

All specialist modules follow an identical adapter contract: validate → construct worker request → call Python worker over HTTP → parse/guard response → return `SpecialistOutput` with provenance (`MODEL_GENERATED` or truthful failure) and `evidenceType`.

| Specialist | Model | Module(s) | Tested |
|---|---|---|---|
| VQA | GeoChat-7B | `backend/server/tools/vqa.ts` | yes (19 assertions) |
| Captioning | GeoChat-7B (description mode) | `backend/server/tools/caption.ts` | yes (24 assertions) |
| Grounding | Grounding DINO Tiny | `backend/server/tools/grounding.ts` | yes (22 assertions) |
| Segmentation | SegFormer-B0 | `backend/server/tools/segmentation.ts` | yes (18 assertions) |
| Change Analysis | TinyCD | `backend/server/tools/changeAnalysis.ts` | yes (20 assertions) |
| Optical + SAR | Dual-Stream Fusion | `backend/server/tools/opticalSar.ts` | yes (21 assertions) |

## 11. Data Strategy

- **Copernicus Data Space Ecosystem (CDSE) STAC** (`backend/server/catalog/stacService.ts`): live scene discovery — the authoritative and only satellite-data source used.
  - Collections: `sentinel-2-l2a`, `sentinel-2-l1c`, `sentinel-1-grd`, `sentinel-1-slc`.
  - Deterministic 4-tier ranking: bbox overlap %, cloud cover, date-midpoint proximity, item ID.
  - SSRF hardening: locked base URL, domain allowlist, loopback/private-IP rejection.
  - Truthful zero-result (`no_results`) and upstream-error (502/504) handling.
- **No other datasets are claimed.** Verification runs used a real Sentinel-2 L2A optical scene and a real optical remote-sensing scene sourced through this pipeline.
- **NASA is NOT integrated.** `NASA_API_KEY` may exist in a local `.env` but is unused by any code and is not referenced in this repository.

## 12. Model-Selection Rationale

Selection was recorded as a Stage 6A audit (`backend/server/tools/modelAudit.ts`, exposed via `GET /api/model-audit`):

- **GeoChat-7B (VQA/Caption):** remote-sensing instruction-tuned VLM; `conditionally_suitable` (requires ≥16 GB VRAM FP16, ~5-6 GB 4-bit); license Llama-2/Vicuna; real T4 inference verified.
- **Grounding DINO Tiny:** lightweight open-vocabulary grounding baseline; `conditionally_suitable`; Apache-2.0; zero-shot general baseline, not RS-specialized; real T4 inference verified.
- **SegFormer-B0 (ADE20K):** compact general semantic segmentation baseline; `conditionally_suitable`; NVIDIA/Apache-2.0; NOT RS-specialized — the audit explicitly demands task-aware rejection for unsupported RS land-cover categories; real T4 inference verified, accuracy not validated.
- **TinyCD:** 0.3M-param bi-temporal change detector; `unverified` (GPU evidence pending); MIT.
- **Optical-SAR fusion:** `research_only`, no verified general checkpoint; academic-variant license status unverified; operating via a decoupled-modality fallback in the result integrator.

## 13. Security Architecture

- **Authentication:** Bearer-token API-key gate (`requireApiKey`) on `/api/*` (health exempt).
- **Authorization / IDOR protection (Phase 2):** no user-object or document-ID choice endpoints; controlled specialist registry; single-analysis orchestration. 42 assertions.
- **Rate limiting / abuse protection (Phase 4):** tiered fixed-window limiter (`inference`/`upload`/`external`/`general`) with per-IP AND per-credential budgets; auth brute-force tarpit. 22 assertions.
- **Secret handling:** server-side env only; `.env*` gitignored; `.env.example` placeholders only; default worker auth keys are explicit dev-only fallbacks; no `VITE_*` secrets in client code; security logger redacts tokens/keys/body bytes.
- **Input validation (Phase 6):** magic bytes, size limits, filename traversal/injection rejection, JSON-depth/oversized-body limits, SQLi/SSRF-adjacent injection probes. 54 assertions.
- **Deployment security (Phase 3):** CSP, HSTS (prod), CORS allowlist, HTTPS enforcement, request IDs, JSON 404/error handlers, production readiness warnings. 43 assertions.

## 14. Evidence and Provenance Architecture

- Every successful pipeline run records `provenanceChain` with `evidenceFabricated: false` and `sihCompliance.zeroFabricatedEvidence: true`, referencing `SUPPORTED_EVIDENCE_TYPES`.
- Specialist output carries `MODEL_GENERATED` provenance or a truthful failure/rejection contract.
- Evidence export (`backend/server/tools/exportEvidence.ts`) audits georeferencing: standard GeoJSON (RFC 7946) only when valid WGS84 georeferencing exists (degenerate `[0,0,1,1]` unit box rejected); otherwise image-space JSON marked `isGeographic: false`, `coordinateSystem: "normalized_image_space"`. 64 assertions.

## 15. Zero-Fabrication / Truthful-Failure Design

- **Design rule:** when a worker or CUDA GPU is unavailable, execution truthfully reports `failed`/`rejected` with a stated reason and `evidenceType: "none"`; the application remains fully usable offline.
- Enforced in every adapter (worker HTTP failure, timeout, malformed response, missing model, HTTP 401) and asserted in tests.
- The model audit truthfully returns 404 for unknown task types and never performs inference.
- This behavior is documented in `README.md` and maintained across all six specialists.

## 16. Current Implementation and Verification Status

| Capability | Implementation | Real inference verified | Accuracy validated | Notes |
|---|---|---|---|---|
| Image ingestion & validation | IMPLEMENTED | — | — | TESTED (12 assertions) |
| NL query parsing | IMPLEMENTED | — | — | TESTED (15 assertions) |
| Agentic routing + compatibility | IMPLEMENTED | — | — | TESTED (18 assertions) |
| VQA (GeoChat-7B) | IMPLEMENTED | YES — Tesla T4, 4-bit, real Sentinel-2 (696×564), 11,738 ms | **NOT VALIDATED** | `backend/inference/geochat/verification_evidence.json` |
| Caption (GeoChat-7B) | IMPLEMENTED | YES — Tesla T4, real Sentinel-2, 7,594 ms | **NOT VALIDATED** | same evidence file |
| Grounding (Grounding DINO Tiny) | IMPLEMENTED | YES — Tesla T4, 1 detection, score 0.8433559, 284 ms | **NOT VALIDATED** | `backend/inference/grounding/verification_evidence.json` |
| Segmentation (SegFormer-B0) | IMPLEMENTED | YES — Tesla T4, real Sentinel-2, 5,692 px, conf 0.2311 | **NOT VALIDATED** | `backend/inference/segmentation/...json` + mask PNG |
| Change Analysis (TinyCD) | IMPLEMENTED (adapter/worker + tests) | NO — PENDING | NO | `unverified` in audit |
| Optical-SAR fusion | IMPLEMENTED (research worker + adapter) | NO — PENDING | NO | `research_only`, no verified checkpoint |
| CDSE/STAC discovery | IMPLEMENTED | YES (live API) | — | TESTED (40 assertions) |
| Unified `/api/analyze` pipeline | IMPLEMENTED | — | — | TESTED (100 assertions E2E) |
| Evidence export/provenance | IMPLEMENTED | — | — | TESTED (64 assertions) |
| Model audit | IMPLEMENTED | — | — | TESTED (~27 assertions) |
| Security (authZ/IDOR/deployment/abuse/input) | IMPLEMENTED | — | — | TESTED (42+43+22+54 assertions) |

## 17. Testing

- **Unit tests:** imageValidator (12), queryParser (15), router (18), specialistAdapter (21), modelAudit (~27), exportEvidence (64), vqa (19), caption (24), grounding (22), segmentation (18), changeAnalysis (20), opticalSar (21), resultAggregator (43), stacService (40).
- **Integration/E2E tests:** fullSpecialistIntegration (98), analyze_e2e (100), plus grounding/change-analysis/optical-SAR E2E suites and security suites.
- **Security tests:** accessControl/IDOR (42), production/deploy (43), abuseProtection (22), inputValidation (54).
- Current result: **20 chained suites, all passing.**

## 18. Real GPU Verification Evidence

| Worker | Evidence file | What it proves |
|---|---|---|
| GeoChat | `backend/inference/geochat/verification_evidence.json` | Real Tesla T4 4-bit forward pass on real Sentinel-2 (696×564): VQA answer + caption, `MODEL_GENERATED`, `synthetic_output: false`. |
| Grounding DINO | `backend/inference/grounding/verification_evidence.json` | Real Tesla T4 run: 1 detection, confidence 0.8433559, `MODEL_GENERATED`. |
| Segmentation | `backend/inference/segmentation/verification_evidence.json` + mask PNG | Real Tesla T4 run on real Sentinel-2: 5,692 segmented pixels, confidence 0.2311, `MODEL_GENERATED`. |

Only the above have recorded GPU inference. Successful execution is **never** converted into an accuracy claim — accuracy is explicitly `NOT VALIDATED` for all three.

## 19. Performance

Only measured values that exist in the repository are reported (recorded in the GeoChat/Grounding evidence files):

- GeoChat VQA forward pass: **11,738 ms** (real T4, 4-bit, Sentinel-2 696×564).
- GeoChat caption forward pass: **7,594 ms** (same environment).
- Grounding DINO Tiny forward pass: **284 ms** (real T4, 1024×1024 scene).
- Segmentation duration: not recorded in the committed evidence file (no number is invented).

No other benchmarks are claimed. `pipelineMetrics` (`parseMs`, `routeMs`, `executeMs`, `totalMs`) are runtime instrumentation, not benchmark results.

## 20. Demo Scenarios

See `docs/final/demo_script.md` for the full script. High-level:

1. **Offline full pipeline:** upload → validate → parse → route → truthful `rejected` when GPU offline (no fabrication).
2. **Model audit:** truthful capability matrix, 404 for unknown task types.
3. **Live CDSE/STAC discovery:** real Copernicus scene search, deterministic ranking, honest empty/error states.
4. **Live T4 inference** (optional, Colab tunnel): GeoChat/Grounding/SegFormer real forward passes.
5. **Evidence walkthrough:** committed `verification_evidence.json` files + segmentation mask PNG.

## 21. Known Limitations

- Accuracy against ground truth is **NOT VALIDATED** for any specialist (only execution is verified).
- Grounding/segmentation models are general-purpose baselines, not RS-specialized.
- TinyCD and Optical-SAR have no recorded GPU evidence (PENDING / `research_only`).
- GeoChat-7B is blocked on local CPU-only hardware (no CUDA).
- Interactive map + AOI drawing (Phase 16) is FUTURE SCOPE; the current repository has no map/GIS library and no NASA integration.

## 22. Current Pending Work

- Record real GPU inference evidence for TinyCD (change analysis) and Optical-SAR fusion.
- Validate specialist answers/masks against ground truth.
- Phase 16 (location search → interactive map → AOI → STAC scene discovery → spatial overlays) is designed, not implemented.

## 23. Future Scope

- Phase 16 location/map/AOI workflows (server-side geocoding + client map), using the existing CDSE/STAC path for scenes.
- Open-vocabulary segmentation (e.g., SAM + Grounding DINO) or RS-tailored fine-tuning.
- Ground-truth accuracy benchmarks per specialist.

## 24. Conclusion

SatQuery AI delivers a complete, query-driven, evidence-grounded remote-sensing analysis workflow with six specialist adapters, live Copernicus STAC discovery, a unified reporting/provenance chain, and defense-in-depth security — all verified by an automated regression suite. Its signature property is the one it was built to guarantee: it never fabricates a result — it truths when a model cannot run.

## 25. References / Sources

- `README.md` — project overview, architecture, API, worker setup.
- `docs/PHASE_4_DATA_STRATEGY.md` — STAC data strategy and verification.
- `backend/server/tools/modelAudit.ts` — authoritative specialist capability audit.
- `backend/inference/{geochat,grounding,segmentation}/verification_evidence.json` — real T4 GPU evidence.
- `backend/inference/*/README.md` — per-worker contracts (including truthful 503/unavailable semantics).
- `docs/final/presentation_outline.md`, `docs/final/demo_script.md` — presentation + demo materials.
- Copernicus Data Space Ecosystem STAC API (`https://stac.dataspace.copernicus.eu/v1/`) — the live scene-discovery source.