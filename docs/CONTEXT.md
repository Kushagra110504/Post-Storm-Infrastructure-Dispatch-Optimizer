# GridRescue: Project Context

## Current State
- **Phase**: 5 (Baseline Dispatcher completed)
- **Status**: Nearest-team-first greedy baseline dispatcher with dependency resolution, skill-match scoring, and KPI evaluation. UI has '⚡ Run Baseline' button + live KPI panel showing makespan, avg resolution, resolved count, facilities restored, weighted restoration delay, and cost J.
- **Test Count**: 65 passing unit tests across 9 test suites.

## Key Architectural Decisions
- **12/8/5 Scenario Generator**: Deterministic by seed (Mulberry32). Generates 4 power, 3 water, 2 comms, 3 road incidents on real Jaipur OSM places with required skill/vehicle/equipment alignments.
- **Guaranteed Road Blocking**: Dijkstra router verifies a road incident blocks the shortest path to a hospital-linked power fault, ensuring dispatch ordering strictly matters.
- **Security & Schema**: Full Zod schema validation on scenario model; import guards against prototype pollution, file size > 1MB, and non-existent graph node/edge references.
- **UI Scenario Viewer**: Real incident and crew depot markers on SVG map with severity badges, dependency tags, and inspector tabs.
- **K-Shortest (Yen-lite)**: `kShortestPaths` wraps Dijkstra to return up to k=3 alternative loop-free routes ordered by travel time. Used by optimizer to pick alt paths.
- **RouteCache**: Memoizes Dijkstra & k-routes results keyed by (start, target, blockedEdges). `invalidate()` called after road-incident clearance.
- **Timeline Simulator**: Discrete-event engine — dependency-aware ordering, skill-match repair scaling (1.5× penalty for mismatched skills), edge unblocking on road-incident completion, facility restoration events.
- **Cost Function J**: `J = α·makespan + β·weightedRestorationDelay + γ·unresolved` where α=1, β=2, γ=500. Evaluated after each simulation; compared by Hill Climbing.

## How to Run
- `npm run dev`: Launch Vite development server
- `npm run test`: Run Vitest unit tests (all 43 tests pass)
- `npm run typecheck`: Run TypeScript compiler check (browser & scripts)
- `npm run lint`: Run ESLint check
- `npm run build`: Build production bundle
