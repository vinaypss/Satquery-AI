# SatQuery AI — Final Demo Rehearsal (Phase 15.4)

**Project:** SatQuery AI — SIH26167 (ISRO / Department of Space · Space Technology · Software)
**Team:** IMPOSTERS
**Repository state:** frozen at `v1.0.0`, working tree clean
**Source of truth:** current source + committed `verification_evidence.json` files + `docs/final/*`

---

## 1. Demo Opening

> "SatQuery AI is an interactive vision-language assistant for multimodal remote-sensing image analysis, built for SIH26167 by Team IMPOSTERS."
>
> **Problem (one sentence):** Analysts must manually pick and glue together different specialist models — detection, segmentation, captioning, change detection — for every new satellite image, with no shared way to validate inputs, route intent, or trust that a result is real.
>
> **Solution (one sentence):** SatQuery AI accepts a natural-language question and an image, then parses intent, validates modality compatibility, routes to the right specialist model, and returns an evidence-grounded result — and when a model/GPU cannot run, it truthfully says so instead of fabricating an answer.

## 2. Recommended Demo Sequence

1. Startup + health check (30 s)
2. Offline full pipeline with truthful failure — strongest local proof (2 min)
3. Model audit (Stage 6A) table (1 min)
4. Live CDSE/STAC scene discovery (2 min, network permitting)
5. Evidence walkthrough — committed T4 verification files (1 min)
6. GPU demo segment — only if a T4 worker is reachable; otherwise note PENDING (2 min)
7. Q&A

## 3. Exact Actions per Step

**Step 1 — Startup + health**
- Start with `npm run dev`; open `http://localhost:3000`.
- Click **Header health monitor** or open the status pill; it must show the backend `status: ok`.

**Step 2 — Offline pipeline + truthful failure**
- Drag the real Sentinel-2 L2A JPEG/PNG (the same one referenced in `backend/inference/geochat/verification_evidence.json`) into **LeftInputPanel**.
- Type one of the exact queries below.
- Observe: upload validation passes → parse result (task + confidence) → routing decision + compatibility check → specialist execution records `failed`/`rejected` with a stated reason and `evidenceType: "none"` because the GPU worker is not reachable.

**Step 3 — Model audit**
- Open the **Model Audit** tab (BottomEvidencePanel) — it shows the six specialists with their truthful `deploymentStatus` (`conditionally_suitable`, `unverified`, `research_only`) plus hardware environment audit.

**Step 4 — Live STAC discovery**
- In **LeftInputPanel** click the STAC launcher → **STACDiscoveryModal**.
- Select an AOI preset (Bengaluru / Delhi / Mumbai / Sriharikota), collection `sentinel-2-l2a`, a date range, cloud-cover ≤ 20%, click search.

**Step 5 — Evidence walkthrough**
- Open the three `backend/inference/*/verification_evidence.json` files and the segmentation mask PNG side by side.

**Step 6 — GPU demo (optional)**
- Only if the GeoChat/Grounding/SegFormer workers are reachable (env vars set). Otherwise read the pending status honestly.

## 4. Exact Example Questions

| # | Query | Parsed task (verified live) |
|---|---|---|
| 1 | `"Describe this satellite image."` | `caption` (confidence 0.95) |
| 2 | `"Locate all buildings."` | `grounding` (confidence 0.95, targetFeatures: buildings) |
| 3 | `"What features are visible in this satellite scene?"` | `vqa` |
| 4 | `"What changed between these two images?"` | `change_analysis` (requires 2 images) |
| 5 | `"Segment the buildings."` | `segmentation` |
| 6 | `"Compare the optical image with the SAR image."` | `optical_sar` (requires optical + SAR) |

## 5. Expected Behavior per Example

1. **Caption** `"Describe this satellite image."` → parse 200 `taskType: caption`; without a GPU worker the execution truthfully fails; with GeoChat reachable it returns a scene description with `MODEL_GENERATED` provenance.
2. **Grounding** `"Locate all buildings."` → parse 200 `taskType: grounding`; the router checks the target; without worker → truthful rejection; with Grounding DINO reachable → bounding box (evidence type `box`).
3. **VQA** → parse 200 `taskType: vqa`; single image required; SAR rejected as `UNSUPPORTED_MODALITY`.
4. **Change analysis** → parse sets `requiresMultipleImages: true`; with one image the router returns `rejected` explaining the incompatibility (does not run). Marked `unverified` in the audit — no fabricated change map ever.
5. **Segmentation** → parse 200 `taskType: segmentation`; only general ADE20K classes supported; RS-specific targets trigger task-aware rejection/fallback guidance; PENDING local worker.
6. **Optical+SAR** → parse 200 `taskType: optical_sar`; the audit marks it `research_only` (no verified checkpoint); demonstrated as research/fallback state only.

## 6. Which Specialist Is Selected

Determined live by `backend/server/agent/queryParser.ts` (verified against the running dev server):

- `caption` for describe/summarize phrasing
- `grounding` for where/locate/find + target
- `vqa` for what/how/are/is questions ending with `?`
- `segmentation` for segment/mask/delineate phrases
- `change_analysis` for changed/before-after/between-years phrases
- `optical_sar` for optical+SAR/radar cross-modal phrases

## 7. Evidence / Provenance to Show

- `ResultReport.provenanceChain` entries with `evidenceFabricated: false`.
- `sihCompliance`: `zeroFabricatedEvidence: true`, `modelAuditRef: "SIH26167-STAGE6A"`.
- Specialist `evidence.evidenceType`: `text` / `box` / `mask` / `none`.
- On failure: `status: failed|rejected`, `rejectionReason`, `evidenceType: "none"` (e.g. vqa.ts returns "GeoChat-7B inference worker is unavailable.").
- Model audit `deploymentStatus` values + real evidence verification IDs (`satquery-geochat-7b-tesla-t4-real-sentinel2`, `satquery-grounding-dino-tesla-t4-001`, `satquery-segformer-b0-tesla-t4-real-sentinel2-1790216772`).

## 8. Workflows Safe Locally (no GPU, no network needed)

- Image validation (magic bytes, size, modality)
- Parse-query and route-task (fully deterministic, server-only)
- Model audit (Stage 6A matrix)
- Truthful-failure demonstration (any specialist with no worker → honest rejection)
- Evidence export audit behavior via tests
- UI rendering (viewer grid/crosshair/overlays with a local image)

## 9. Workflows Requiring a GPU/T4 Environment

- GeoChat VQA / caption real inference (T4, 4-bit, ~11.7 s / ~7.6 s recorded)
- Grounding DINO Tiny real inference (T4, 0.8433559 confidence recorded)
- SegFormer-B0 segmentation real inference (T4, Sentinel-2, 5,692 px recorded)
- Change analysis (TinyCD) — **PENDING**, no recorded GPU evidence
- Optical-SAR fusion — **research_only**, no verified checkpoint

## 10. Live CDSE/STAC Demonstration Procedure

1. Open STACDiscoveryModal.
2. Preset AOI (e.g., Bangalore region) OR paste bbox; collection `sentinel-2-l2a`; date range; cloud cover ≤ 20%; limit.
3. Search → `POST /api/catalog/search` returns real Copernicus items ranked by bbox overlap → cloud cover → date proximity → ID.
4. Show a returned scene's ID, acquisition date, cloud %, thumbnail.
5. Select a scene to ingest as the analyzed image.
6. If network is down or CDSE returns nothing, run `backend/scripts/verify-stac.ts` (needs network) OR explain the tested truthful `no_results` behavior and show `backend/server/catalog/stacService.test.ts` (40 assertions). Never fabricate scenes.

## 11. Model-Audit Demonstration Procedure

1. Open BottomEvidencePanel → **Model Audit** tab.
2. Walk the six rows: VQA / Caption / Grounding / Segmentation `conditionally_suitable`; Change `unverified`; Optical-SAR `research_only`.
3. Note the hardware audit: local CPU-only (`blocked_for_cuda_inference`) vs. Colab T4 (`conditionally_suitable`).
4. (Optional) call `GET /api/model-audit?taskType=optical_sar` → returns the entry; update to `?taskType=fake` → truthful 404.

## 12. Truthful-Failure Demonstration Procedure

1. Ensure no worker env is set (default local state).
2. Upload image, type `"Describe this satellite image."` → run `/api/analyze`.
3. Expected: `report.status: "failed"`, `errorSummary` explaining the worker is unavailable, `provenanceChain` with `evidenceFabricated: false`, `provenanceVerified: false`, `evidenceType: "none"`.
4. Say: "No model was reachable, so the pipeline recorded an honest failure instead of inventing an answer. Offline, SatQuery remains fully usable and auditable."

## 13. Backup Procedures

| Failure | Backup |
|---|---|
| Network fails (STAC) | Skip live search; show `stacService.test.ts` + Phase 4 doc; state CDSE unavailable and system reports `no_results`/502/504 truthfully. |
| GPU worker unavailable | Use truthful-failure demo + committed `verification_evidence.json` walkthrough; state GPU not reachable in this venue. |
| STAC returns no results | Show the empty-state handling; refine bbox/date/cloud filters; explain deterministic ranking + honest zero-result. |
| Browser/UI problem | Refresh; confirm port 3000; open `http://localhost:3000/api/health` directly to prove backend; fall back to repository + tests for narrative. |
| API server fails | Restart `npm run dev`; check port free; verify `.env` sanity; last resort run `npm test` to show the suite green. |

## 14. Judge Talking Points

- **Query-driven orchestration:** one natural-language question selects and drives the correct specialist (parse → route → execute).
- **Multimodal compatibility:** strict task × image-pair/modality validation prevents nonsense runs (e.g., SAR→optical-only, single-image→change analysis).
- **Evidence/provenance:** every report carries a provenance chain and `evidenceFabricated: false`; evidence export audits GeoJSON vs image-space coordinates.
- **Truthful failure:** no worker/GPU → honest `failed`/`rejected` with reason and empty evidence, never a fake box/mask/answer.
- **Security:** Bearer API-key gate, tiered rate limiting, input validation, CSP/HSTS/CORS allowlist, SSRF-hardened STAC client, redacting security logger.
- **Real satellite-data discovery:** live Copernicus CDSE STAC search — no local mock dataset.

## 15. Claims to Avoid During the Demo

- Any accuracy/benchmark percentage not present in a `verification_evidence.json` file.
- "NASA integration" — NASA is unused (`NASA_API_KEY` is a stray, uncommitted, locally ignored value; no code reads it).
- "Interactive map / AOI" as completed — Phase 16 is FUTURE SCOPE.
- "Change analysis verified" or "Optical-SAR verified" — TinyCD is `unverified`, Optical-SAR is `research_only`.
- Claiming local execution of VQA/caption/grounding/segmentation unless a real worker is connected.
- Converting successful execution into an accuracy claim ("it ran" ≠ "it's accurate").

## 16. Final Pre-Demo Checklist

- [ ] `npm run dev` starts; `http://localhost:3000` loads the UI.
- [ ] `/api/health` returns `status: ok`.
- [ ] `npm test`, `npm run lint`, `npm run build` pass (performed in Phase 15.4).
- [ ] Real Sentinel-2 sample image ready on disk for upload.
- [ ] Determine STAC network reachability before the demo (test once).
- [ ] Decide GPU strategy (live tunnel OR committed-evidence walkthrough).
- [ ] `.env` is NOT committed; `git status` clean; tag `v1.0.0` intact.
- [ ] Keep `docs/final/demo_quick_reference.md` open as a one-page fallback.

---

## Final Status Table (current, exact)

| Feature | Local demo | GPU/T4 demo | Evidence status | Notes |
|---|---|---|---|---|
| Image validation | YES | — | TESTED (12) | magic bytes, ≤25 MB, modality |
| NL parse + routing | YES | — | TESTED (15+18) | deterministic, verified live |
| Model audit | YES | — | TESTED (~27) | truthful statuses + 404 unknown |
| VQA (GeoChat-7B) | Truthful-only | YES (T4 4-bit) | REAL INFERENCE VERIFIED · NOT ACCURACY VALIDATED | `geochat/verification_evidence.json` |
| Caption (GeoChat-7B) | Truthful-only | YES (T4 4-bit) | REAL INFERENCE VERIFIED · NOT ACCURACY VALIDATED | same evidence file |
| Grounding (DINO Tiny) | Truthful-only | YES (T4) | REAL INFERENCE VERIFIED · NOT ACCURACY VALIDATED | `grounding/verification_evidence.json`, score 0.8433559 |
| Segmentation (SegFormer-B0) | Truthful-only | YES (T4) | REAL INFERENCE VERIFIED · NOT ACCURACY VALIDATED | `segmentation/verification_evidence.json` + mask PNG |
| Change analysis (TinyCD) | Truthful-only | PENDING | UNVERIFIED | no GPU evidence; router rejects 1-image use |
| Optical + SAR | Truthful-only | PENDING | RESEARCH_ONLY | no verified checkpoint |
| CDSE/STAC discovery | YES (needs network) | — | LIVE + TESTED (40) | real CDSE data, honest empty/error |
| Evidence/provenance export | YES | — | TESTED (64) | GeoJSON vs image-space audit |
| Unified `/api/analyze` | YES | YES | TESTED (100 E2E) | truthful failed/rejected states |
| Security (authZ/deploy/abuse/input) | YES | — | TESTED (42+43+22+54) | behavior unchanged |
| Phase 16 map/AOI | NO | NO | FUTURE SCOPE | not implemented, not claimed |