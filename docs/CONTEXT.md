# GridRescue: Project Context

## Current State
- **Phase**: 9 (v1.0.0 Production Release Complete)
- **Status**: Complete production implementation. Bundled real Jaipur OSM road network & places, offline SVG renderer, 12/8/5 scenario generator with blocking-road rule, nearest-first baseline dispatcher, Hill Climbing optimizer with random restarts in background Web Worker, dynamic replanning with warm starts, plain-language explainability, and comprehensive docs (`README.md`, `DEMO.md`, `PLAN.md`).
- **Test Count**: 82 passing unit tests across 12 test suites.

## Key Architectural Decisions
- **12/8/5 Scenario Generator**: Deterministic by seed (Mulberry32). Generates 4 power, 3 water, 2 comms, 3 road incidents on real Jaipur OSM places with required skill/vehicle/equipment alignments.
- **Guaranteed Road Blocking**: Dijkstra router verifies a road incident blocks shortest path to hospital power fault, ensuring dispatch ordering strictly matters.
- **Security & Schema**: Strict CSP meta tag, Zod schema validation across scenarios, imports, and worker message events; guards against prototype pollution and >1MB files.
- **Hill Climbing Engine**: 3 move types (`swap-team`, `swap-route`, `swap-order`), random restarts on local minima, monotonic best-J tracking, and parameterization (seed, maxRestarts, maxIterations).
- **Web Worker Decoupling**: Background `optimizer.worker.ts` communicates via validated typed messages (`START`, `STOP`, `PROGRESS`, `DONE`, `ERROR`) with automatic main-thread fallback for Node/tests.
- **Warm-Start Replanning**: Preserves completed incidents at $t=t_{\text{now}}$ as immutable prefixes while warm-starting Hill Climbing on active and pending tasks with new disruption arrivals.
- **Explainability Engine**: Computes assignment diffs (`NEW`, `REASSIGNED`, `REROUTED`, `UNCHANGED`), KPI deltas, and natural language narrative explaining why changes were made.

## How to Run
- `npm run dev`: Launch Vite development server
- `npm run test`: Run Vitest unit tests (82 tests pass across 12 suites)
- `npm run benchmark`: Run automated optimizer performance benchmark
- `npm run typecheck`: Run TypeScript compiler check (browser & scripts)
- `npm run lint`: Run ESLint check
- `npm run build`: Build production bundle
