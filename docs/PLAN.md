# GridRescue: Architecture & Implementation Plan

## Architecture Overview
- **Core (Framework-free TS)**: Graph models, Dijkstra routing, timeline simulation, cost function J, and Hill Climbing with random restarts. All seeded via mulberry32 PRNG.
- **Web Worker**: Background optimizer decoupling compute from the UI thread to guarantee 60 FPS rendering.
- **Map Renderer**: Offline SVG renderer using equirectangular projection of bundled OpenStreetMap data (Jaipur, India). Zero external tiles/SDKs.
- **State & UI**: Zustand state management, accessible control-room dashboard, schedule Gantt, convergence chart, replan explainability panel.

## Folder Layout
```
├── data/              # city.json, places.json, ATTRIBUTION.md
├── docs/              # PLAN.md, CONTEXT.md, DEMO.md
├── scripts/           # build-map-data.ts, benchmark scripts
├── src/
│   ├── core/          # model, graph, routing, plan, cost, baseline, hillclimb, replan, explain, scenario, rng
│   ├── state/         # store.ts (Zustand)
│   ├── ui/            # Map, Gantt, Controls, ComparisonTable, ExplainPanel
│   └── workers/       # optimizer.worker.ts, optimizerClient.ts
└── tests/             # unit & integration tests, fixtures/mini-city.json
```

## Phase Checklist
- [x] **Phase 0: Scaffold** - Vite/React/TS strict, ESLint/Prettier, Vitest, docs, scripts.
- [x] **Phase 1: Real Map Pipeline** - Overpass fetch/fallback, graph contraction, JSON export, Zod schema, fixture.
- [x] **Phase 2: Map Renderer** - Offline SVG renderer, pan/zoom, LOD, spatial index picking, road blocking.
- [x] **Phase 3: Domain & Scenario** - Types, seeded RNG, 12/8/5 Jaipur scenario generator with blocking-road rule.
- [x] **Phase 4: Routing & Simulator** - Dijkstra (k=3), blocked-edge handling, timeline simulator, cost function J.
- [x] **Phase 5: Baseline Dispatcher** - Nearest-team-first baseline and UI KPI evaluation.
- [x] **Phase 6: Hill Climbing Worker** - Neighbor moves, restarts, Web Worker messaging, convergence curves.
- [x] **Phase 7: Dynamic Replanning** - Mid-operation fault injection/closure, warm starts, plain-language explainers.
- [x] **Phase 8: Hardening & Benchmark** - Strict CSP, Zod message validation, benchmark suite, a11y pass.
- [x] **Phase 9: Docs & Polish** - Comprehensive README, walkthrough DEMO.md, final v1.0.0 release.
