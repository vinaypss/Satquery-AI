# SatQuery AI — Final Demo Script

**Project:** SatQuery AI — SIH26167 (ISRO / Department of Space, Space Technology, Software)
**Team:** IMPOSTERS
**Prepared from:** current repository state + `docs/final/SatQuery_AI_Technical_Report.md` + committed verification evidence.

This script only includes workflows that are actually runnable from the current repository. No fake screenshots, no fake result images, no invented metrics.

---

## Environment Prerequisites (verify before judging session)

| Check | Command / action | Expected |
|---|---|---|
| Backend + UI up | `npm run dev` (or `npm start` after `npm run build`) | UI at http://localhost:3000, health OK |
| Full test suite | `npm test` | All suites green |
| Lint | `npm run lint` | Clean `tsc --noEmit` |
| Build | `npm run build` | `dist/` + `dist/server.cjs` produced |
| Optional: STAC live access | Network to `https://stac.dataspace.copernicus.eu/v1/` | Scene search returns real results |
| Optional: GPU workers | Workers under `backend/inference/*/worker.py` connected via env vars | See per-demo notes |

If no GPU worker is connected, the system **truthfully reports unavailability** — this is a feature (zero-fabrication), not a failure. The script includes a dedicated demo of it.

---

## DEMO 1 — Full Offline Pipeline (strongest, always runnable; no GPU needed)

**Goal:** Show validation → parsing → routing → truthful model execution behavior, and evidence export.

- **Starting state:** App running at http://localhost:3000. Backend healthy (status header shows connected). No GPU worker connected (or workers offline).
- **User action 1:** Drag-and-drop a real satellite/remote-sensing image into the LeftInputPanel (e.g., a Sentinel-2 L2A JPEG/PNG). Upload triggers magic-byte/format/size validation.
- **Input image/data:** any real optical remote-sensing image (≤ 25 MB, supported format). The repository-based examples: Sentinel-2 L2A scene used in verification evidence (696×564).
- **Expected application behavior:** Image accepted and displayed in CenterImageViewer (zoom, grid toggle, compass). Invalid file (wrong magic bytes) → truthful validation rejection.
- **User action 2:** Type a query.
- **Exact query (recommended):** `"Where are the buildings?"` (grounding) — or `"Describe this satellite image."` (caption), `"What features are visible?"` (VQA).
- **Expected application behavior:**
  1. `/api/parse-query` returns parsed intent + target ("grounding", target "building").
  2. `/api/route-task` returns routing decision + compatibility check (task × image pair).
  3. `/api/analyze` executes the specialist adapter. Because the model worker is offline, the adapter truthfully returns `failed`/`rejected` with a stated reason and `evidenceType: "none"` — **no fabricated boxes/masks/answers**.
- **Model/tool used:** server adapters (`backend/server/tools/*.ts`), router, resultAggregator. No worker needed for this path.
- **Evidence shown:** RightAnalysisPanel (routing + execution contract), BottomEvidencePanel (execution record with `evidenceFabricated: false`, `sihCompliance.zeroFabricatedEvidence: true`); model audit tab.
- **What to say to judges:** "SatQuery never fabricates. When the model worker isn't reachable, the run is recorded as rejected with the exact reason and an empty evidenceType — the pipeline and audit trail remain fully functional offline. This is the SIH26167 integrity guarantee."
- **Failure contingency:** If upload fails, verify magic-byte support / file size; switch to the bundled real Sentinel-2 test image; check server logs for adapter reason.

---

## DEMO 2 — Model Audit (Stage 6A) — always runnable, no GPU needed

**Goal:** Show the authoritative capability matrix + matrix summary.

- **Starting state:** App running; network to server OK.
- **User action:** Open the Model Audit tab (BottomEvidencePanel) or call `GET /api/model-audit`.
- **Input data:** none (registry-driven).
- **Exact query:** none.
- **Expected application behavior:** Shows six specialists with truthful deployment status: VQA/Caption/ Grounding/Segmentation `conditionally_suitable` (real T4 evidence recorded), TinyCD `unverified`, Optical-SAR `research_only`. Also shows hardware environment audit (dev machine CPU-only vs Colab T4). Unknown `taskType` → truthful 404.
- **Model/tool used:** `backend/server/tools/modelAudit.ts`.
- **Evidence shown:** the exact `deploymentStatus` values and the committed verification evidence references (verification IDs) bound to each model.
- **What to say to judges:** "This screen is generated from `modelAudit.ts` — the same file the pipeline links to. It tells evaluators exactly which models have real recorded GPU evidence and which are pending, rather than claiming uniform readiness."
- **Failure contingency:** none (pure registry read).

---

## DEMO 3 — Live CDSE/STAC Scene Discovery — requires network

**Goal:** Prove real, live Copernicus satellite data discovery (no local mock dataset).

- **Starting state:** App running; internet reachable to `https://stac.dataspace.copernicus.eu/v1/`; STAC modal opened from LeftInputPanel.
- **User action:** In STACDiscoveryModal, select an AOI preset (e.g., Bengaluru, Delhi, Mumbai, Sriharikota) or enter bbox + date range; choose collection (Sentinel-2 L2A) and cloud-cover limit; click search.
- **Input data:** real bbox/date params.
- **Expected application behavior:** `/api/catalog/search` returns **real** Copernicus items, deterministically ranked (bbox overlap → cloud cover → date-midpoint → item ID). Scene thumbnails/preview + metadata shown in the modal; user selects a scene to ingest into the workspace as the analyzed image.
- **Model/tool used:** `backend/server/catalog/stacService.ts` (SSRF-hardened CDSE client).
- **Evidence shown:** returned scenes with real Sentinel-2 item IDs, bboxes, dates, cloud percentages; provenance "real CDSE response" (zero-result → truthful `status: "no_results"`).
- **What to say to judges:** "This is live Copernicus Data Space Ecosystem — real Sentinel-2/1 items, not a cached dataset. Ranking is deterministic and the client is SSRF-hardened; upstream failures return honest errors, never fake scenes."
- **Failure contingency:** If network is down, show the feature via the unit/integration tests (`backend/server/catalog/stacService.test.ts` — 40 assertions) and the Phase 4 design doc; do NOT fabricate search results on screen.

---

## DEMO 4 — Real GPU Inference Replay (optional — requires T4 workers on Colab)

**Goal:** Show real model output with recorded provenance. Recommended only if the judge environment allows connecting the Colab T4 tunnel; otherwise use Demo 5 (evidence-only).

- **Starting state:** GeoChat worker (port 8088), Grounding worker (8002), SegFormer worker (8003) reachable; env vars set (`GEOCHAT_WORKER_URL`, `GROUNDING_WORKER_URL`, `SEGMENTATION_WORKER_URL`); backend restarted.
- **User action:** Upload the real Sentinel-2 L2A scene used in verification; ask the VQA question.
- **Exact query:** `"What features are visible in this satellite scene?"`
- **Expected application behavior:** `/api/analyze` runs real forward passes; VQA answer + caption returned with `MODEL_GENERATED` provenance; grounding returns a real bounding box; segmentation returns a real mask.
- **Model/tool used:** GeoChat-7B (4-bit), Grounding DINO Tiny, SegFormer-B0.
- **Evidence shown:** outputs with `MODEL_GENERATED` provenance matching committed evidence (VQA 11,738 ms; caption 7,594 ms; grounding score 0.8433559; segmentation 5,692 pixels, conf 0.2311).
- **What to say to judges:** "These are genuine forward passes on a real Sentinel-2 scene recorded on a Tesla T4. We classify accuracy as NOT VALIDATED — we verified execution, not ground-truth accuracy — and the system itself reports models accordingly."
- **Failure contingency:** Worker/driver/tunnel issues → fall back to Demo 5 and state clearly that live GPU is not reachable in this venue (truthful).

---

## DEMO 5 — Committed Evidence Walkthrough (fallback; ALWAYS runnable)

**Goal:** Show real verification evidence without a live GPU.

- **Starting state:** Repository open; no worker required.
- **User action:** Open, in order:
  1. `backend/inference/geochat/verification_evidence.json`
  2. `backend/inference/grounding/verification_evidence.json`
  3. `backend/inference/segmentation/verification_evidence.json`
  4. `backend/inference/segmentation/segmentation_real_sentinel2_building_mask.png`
- **Expected application behavior:** Each file shows `MODEL_GENERATED` provenance, `synthetic_*: false`, real env details (Tesla T4, CUDA, torch versions), real input (real Sentinel-2 file names + dimensions), and recorded outputs/durations.
- **What to say to judges:** "These are our committed evidence files. Every number you see is traceable to a recorded run. Models without such a file — TinyCD and Optical-SAR — are honestly marked pending/research in the audit."
- **Failure contingency:** none.

---

## Cross-Demo Rules for Judges' Q&A
- Do NOT quote accuracy percentages — none are validated.
- "Interactive map / AOI location search" is FUTURE SCOPE (Phase 16) — only describe the current STAC discovery as implemented.
- NASA is not integrated; do not claim it.
- If a model/GPU is unavailable, say so and show the truthful rejection — that is the point.

## Truthfulness Boilerplate (memorize)
"Every result in SatQuery AI carries provenance. Real inference is only claimed where we have a committed `verification_evidence.json` file; everything else is marked pending or not accuracy-validated. The system refuses to fabricate output when a model is unavailable — that honesty is a core requirement of SIH26167."