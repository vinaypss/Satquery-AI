# SatQuery AI — Demo Quick Reference (one page)

**SatQuery AI · SIH26167 · Team IMPOSTERS** — repo frozen `v1.0.0`

## Startup
```
npm run dev        →  http://localhost:3000   (health: GET /api/health → status ok)
```

## Sequence
1. Upload a real satellite image (LeftInputPanel)
2. Type a query below → run (or `/api/analyze`)
3. Show Model Audit tab
4. Live STAC search (network)
5. Truthful-failure demo
6. Committed evidence files (no GPU)

## Queries

| Query | Task | Expect |
|---|---|---|
| `Describe this satellite image.` | caption | parse 200; execution truthful-fails locally; real caption only with GeoChat worker |
| `Locate all buildings.` | grounding | parse 200 (target buildings); box only with Grounding DINO worker |
| `What features are visible in this satellite scene?` | vqa | parse 200; single image; SAR rejected |
| `What changed between these two images?` | change_analysis | requires 2 images; 1-image → rejected (never runs); PENDING GPU |
| `Segment the buildings.` | segmentation | parse 200; ADE20K baseline limits; PENDING locally |
| `Compare the optical image with the SAR image.` | optical_sar | research_only; show PENDING/fallback state |

## Backup Plan
- **STAC down** → skip; cite `stacService.test.ts` (40) + honest `no_results`/502/504.
- **GPU down** → truthful-failure + `backend/inference/*/verification_evidence.json` walkthrough.
- **UI/API down** → restart `npm run dev`; check port 3000; last resort `npm test`.
- **STAC zero results** → refine bbox/date/cloud; explain ranking.

## Claims to Avoid
- No accuracy % (none validated) · No NASA integration · No Phase 16 map/AOI · No "change verified" (unverified) / "optical-SAR verified" (research_only) · Real inference only with live T4 worker.

## Enforced Truth
- No worker/GPU → `failed`/`rejected` + reason + `evidenceType:"none"`, `evidenceFabricated:false`. Report failure is a feature.