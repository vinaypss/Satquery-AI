# SatQuery AI — Project Structure

**SIH26167 · Team IMPOSTERS** — repository layout after the final frontend/backend refactor (pre-GitHub upload).

## Overview

The repository is organized into two top-level application directories plus a documentation tree. All build/config entry points remain at the repository root so the same commands (`npm run dev`, `npm run build`, `npm start`) work unchanged before and after cloning.

```
satquery-ai/
├── frontend/
│   ├── client/                    # React + Tailwind v4 UI (components, pages, styles, types)
│   └── src/                       # Vite app entry (main.tsx, App.tsx, index.css)
├── backend/
│   ├── server/                    # Express + TypeScript API, security, agent, tools, validation
│   ├── inference/                 # Independent Python GPU worker microservices
│   └── scripts/                   # Standalone utility scripts (e.g. STAC verification)
├── docs/                          # Design documents + final deliverables
│   └── final/                     # Technical report, presentation, demo, release docs
├── .env.example                   # Environment variable template (placeholders only)
├── .gitignore
├── index.html                     # Vite SPA shell (entry: /frontend/src/main.tsx)
├── LICENSE
├── metadata.json
├── package.json
├── package-lock.json
├── server.ts                      # Unified full-stack entry (Express + Vite / static)
├── tsconfig.json
└── vite.config.ts
```

## Purpose of Top-Level Directories

### `frontend/` — Client application
- `frontend/client/`: all UI code — components (Header, LeftInputPanel, CenterImageViewer, RightAnalysisPanel, BottomEvidencePanel, ResultReportCard, STACDiscoveryModal), the three-pane `pages/WorkspacePage.tsx`, `styles/gis.css`, and `types/index.ts` (client state/evidence contracts).
- `frontend/src/`: Vite React entry — `main.tsx` (mount), `App.tsx` (workspace composition), `index.css` (Tailwind v4).
- `frontend/` contains **no server logic** and **no secret configuration**; it talks to the API over HTTP only.

### `backend/` — Server, workers, and tooling
- `backend/server/`: the Express application — route controllers, security middleware (access control, rate limiting, input validation, logging), the agent layer (query parser, router, result aggregator), the six specialist tool adapters, STAC catalog client, validation, and shared remote-sensing types. TypeScript tests are co-located as `*.test.ts`.
- `backend/inference/`: five standalone Python GPU worker microservices (GeoChat-7B VQA/caption, Grounding DINO Tiny, SegFormer-B0, TinyCD change analysis, Optical-SAR fusion). Each is self-contained (`worker.py` + `requirements.txt` + README + tests + verification evidence where recorded). Real inference runs only on an external CUDA worker; offline, adapters truthfully report `failed`/`rejected`.
- `backend/scripts/`: development/verification scripts (e.g. `verify-stac.ts`).

### `docs/` — Documentation
- Phase design documents (e.g. `PHASE_4_DATA_STRATEGY.md`) and `docs/final/` deliverables for the hackathon submission: technical report, presentation outline, demo script, demo rehearsal, quick reference, release checklist, and this file.

## Root Files (Keep at Repository Root)

- `package.json` / `package-lock.json`: npm scripts (`dev`, `build`, `start`, `test`, `lint`) and dependencies. Tests target `backend/server/**`. Note: `bun.lock` is present locally but gitignored.
- `index.html`: Vite SPA shell; its entry point is `/frontend/src/main.tsx`.
- `server.ts`: unified full-stack entry — builds the Express app from `backend/server/index.ts`, wires Vite middleware in dev or static `dist/` serving + SPA fallback in production, binds `process.env.PORT || 3000` on `0.0.0.0`.
- `vite.config.ts`: Vite root stays at the repository root (index.html lives here); React + Tailwind plugins, `@` alias to repo root, SPA dev middleware.
- `tsconfig.json`: project-wide TypeScript config (no `include` — type-checks the whole tree).
- `.env.example`, `.gitignore`, `LICENSE`, `metadata.json`, `README.md`.

## Path Convention

| Old location | New location |
|---|---|
| `client/` | `frontend/client/` |
| `src/` | `frontend/src/` |
| `server/` | `backend/server/` |
| `inference/` | `backend/inference/` |
| `scripts/` | `backend/scripts/` |

All internal imports are relative and were preserved by moving each subtree as a unit; only the root entry points (`server.ts`, `index.html`, `package.json` test paths) and documentation references were updated. No application behavior, API contract, security posture, or evidence file changed.