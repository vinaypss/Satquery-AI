# SatQuery AI — Phase 4 Data Strategy: STAC Satellite Discovery
**Problem Statement SIH26167** | **ISRO / Department of Space** | **Team IMPOSTERS**

---

## 1. Executive Summary

Phase 4 implements a real, truthful, open-access satellite data discovery pipeline for **SatQuery AI**. Rather than relying on synthetic images or local mock datasets, SatQuery AI connects directly to the **Copernicus Data Space Ecosystem (CDSE)** SpatioTemporal Asset Catalog (STAC) API (`https://stac.dataspace.copernicus.eu/v1/`).

Users can specify an Area of Interest (AOI) bounding box, date range, satellite modality (Optical Sentinel-2 vs. SAR Sentinel-1), and maximum cloud cover percentage. The system deterministically searches, ranks, and filters candidate satellite scenes, exposes safe asset and thumbnail URLs, and allows one-click ingestion into the SatQuery AI GIS workspace.

---

## 2. Architecture & Data Flow

```
+-------------------------------------------------------------+
|               Frontend Client (React + Tailwind)            |
|  - AOI Presets / Custom Bounding Box                        |
|  - Date Range & Modality Selector (Optical vs. SAR)         |
|  - Cloud Cover Threshold Slider                             |
|  - Scene Preview & One-Click Workspace Ingestion            |
+------------------------------+------------------------------+
                               |
                               | POST /api/catalog/search
                               v
+-------------------------------------------------------------+
|              Express Server (backend/server/routes/catalog.ts)      |
|  - Input Validation (BBox bounds, ISO date range, modality) |
|  - Truthful Error Mapping (400 Bad Request, 502/504 Upstream)|
+------------------------------+------------------------------+
                               |
                               | STACCatalogService.search()
                               v
+-------------------------------------------------------------+
|             STAC Engine (backend/server/catalog/stacService.ts)     |
|  - SSRF Security Validator (Domain allowlist, IP rejection) |
|  - STAC Query Formulation (BBox, datetime, query filters)   |
|  - Spatial Intersection & AOI Overlap % Calculator          |
|  - Deterministic 4-Tier Ranking Engine                      |
|  - Asset Normalization (Thumbnail, Visual, Metadata)        |
+------------------------------+------------------------------+
                               |
                               | POST /v1/search (JSON)
                               v
+-------------------------------------------------------------+
|     Copernicus Data Space Ecosystem (CDSE) STAC API         |
|     Base: https://stac.dataspace.copernicus.eu/v1/          |
|  - Sentinel-2 L2A (Surface Reflectance, 10m Optical)        |
|  - Sentinel-2 L1C (Top of Atmosphere, 10m Optical)          |
|  - Sentinel-1 GRD (Ground Range Detected, C-Band SAR)       |
|  - Sentinel-1 SLC (Single Look Complex, C-Band SAR)         |
+-------------------------------------------------------------+
```

---

## 3. Supported Sensor Collections

| Collection ID | Sensor / Instrument | Modality | Ground Sample Distance (GSD) | Revisit Time | Processing Level |
|---|---|---|---|---|---|
| `sentinel-2-l2a` | Sentinel-2 MSI | Optical | 10m (VNIR), 20m (RedEdge/SWIR), 60m | 5 days | Bottom-Of-Atmosphere (Surface Reflectance) |
| `sentinel-2-l1c` | Sentinel-2 MSI | Optical | 10m (VNIR), 20m (RedEdge/SWIR), 60m | 5 days | Top-Of-Atmosphere Reflectance |
| `sentinel-1-grd` | Sentinel-1 C-SAR | SAR | 10m x 10m (IW spatial resolution) | 6-12 days | Level-1 Ground Range Detected (VV/VH) |
| `sentinel-1-slc` | Sentinel-1 C-SAR | SAR | 5m x 20m (IW single look complex) | 6-12 days | Level-1 Single Look Complex (phase-preserving) |

---

## 4. Deterministic 4-Tier Ranking Engine

When querying candidate satellite granules covering an Area of Interest (AOI), candidate scenes are ranked strictly and deterministically using the following order:

1. **Spatial Overlap Percentage ($\downarrow$)**:
   $$\text{Overlap \%} = \frac{\text{Area}(\text{Scene BBox} \cap \text{Query BBox})}{\text{Area}(\text{Query BBox})} \times 100$$
   Granules that cover 100% or more of the query AOI are prioritized over partial edge captures.
2. **Cloud Cover Percentage ($\uparrow$)**:
   For optical collections (`sentinel-2-l2a`, `sentinel-2-l1c`), scenes with the lowest cloud contamination (`eo:cloud_cover`) rank first. SAR scenes treat cloud cover as neutral (0%).
3. **Date Proximity to Target Range Midpoint ($\uparrow$)**:
   Granules acquired closest to the center of the user's temporal window are prioritized.
4. **Lexicographical Item ID ($\uparrow$)**:
   Unique granule product ID serves as an absolute, deterministic tiebreaker.

---

## 5. Security & SSRF Hardening

To guarantee security in government and enterprise environments:
- **Locked STAC Base URL**: Server hardcodes and restricts catalog requests to the official Copernicus STAC service: `https://stac.dataspace.copernicus.eu/v1/`.
- **SSRF Domain Allowlist**: All asset links and quicklook URLs must resolve to verified Copernicus/Creodias infrastructure:
  - `stac.dataspace.copernicus.eu`
  - `dataspace.copernicus.eu`
  - `datahub.creodias.eu`
  - `download.dataspace.copernicus.eu`
  - `zipper.dataspace.copernicus.eu`
  - `catalogue.dataspace.copernicus.eu`
  - `eodata.dataspace.copernicus.eu`
  - `eodata.cloudferro.com`
- **Loopback & Private Network Rejection**: Requests targeting `localhost`, `127.0.0.1`, RFC1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), cloud metadata services (`169.254.169.254`), or non-HTTP protocols (`file://`, `gopher://`) are immediately rejected.

---

## 6. Truthful Error & Zero-Result Handling

- **No Synthetic Hallucinations**: When no satellite passes exist for a specified spatiotemporal window, the API responds with HTTP 200 and an explicit status:
  ```json
  {
    "status": "no_results",
    "totalFound": 0,
    "returnedCount": 0,
    "results": []
  }
  ```
  Zero dummy or fabricated scenes are generated.
- **Validation Errors (HTTP 400)**: Inverted bounding boxes, out-of-range latitude/longitude, or invalid chronological dates (`startDate > endDate`) return clear explanatory errors.
- **Upstream Resilience (HTTP 502 / 504)**: Connection drops or upstream timeouts (configured with an `AbortController`) return truthful gateway errors.

---

## 7. Verification Evidence

### Automated Test Suite
- Unit tests: `backend/server/catalog/stacService.test.ts` (40/40 assertions passed)
- Full specialist test suite: `npm test` (16 suites, ~562 assertions — all pass)
- TypeScript compilation: `npm run lint` (0 errors)
- Production build: `npm run build` (Vite client + esbuild bundle succeeded)

### Live CDSE STAC Verification
Executed via `npx tsx backend/scripts/verify-stac.ts` against `https://stac.dataspace.copernicus.eu/v1/search`:
- **Optical (Sentinel-2 L2A)**: Retrieved real scene `S2A_MSIL2A_20240118T051131_N0510_R019_T43PGQ_20240118T081358` over Bengaluru AOI (0.15% cloud cover, 100% overlap, safe thumbnail on `datahub.creodias.eu`).
- **SAR (Sentinel-1 GRD)**: Retrieved real scene `S1A_IW_GRDH_1SDV_20240110T004030_20240110T004055_052037_0649ED_CE1D_COG` over Bengaluru AOI (100% overlap, safe thumbnail on `datahub.creodias.eu`).
- **Zero-Result Handling**: Verified empty result for 1-minute window returns `no_results` without hallucination.
