# GridRescue: Project Context

## Current State
- **Phase**: 6 (Hill Climbing Worker completed)
- **Status**: Hill climbing with random restarts and 3 neighbor moves (swap-team, swap-route, swap-order). Web Worker architecture decouples optimizer from UI for 60 FPS rendering. ComparisonTable renders side-by-side KPIs vs baseline and live SVG convergence curve. Dispatch tab inspects crew schedules.
- **Test Count**: 74 passing unit tests across 10 test suites.

## Key Architectural Decisions
- **12/8/5 Scenario Generator**: Deterministic by seed (Mulberry32). Generates 4 power, 3 water, 2 comms, 3 road incidents on real Jaipur OSM places with required skill/vehicle/equipment alignments.
- **Guaranteed Road Blocking**: Dijkstra router verifies a road incident blocks shortest path to hospital power fault, ensuring dispatch ordering strictly matters.
- **Security & Schema**: Full Zod schema validation; guards against prototype pollution, >1MB files, and invalid node/edge references.
- **Hill Climbing Engine**: 3 move types (`swap-team`, `swap-route`, `swap-order`), random restarts on local minima, monotonic best-J tracking, and parameterization (seed, maxRestarts, maxIterations).
- **Web Worker Decoupling**: Background `optimizer.worker.ts` communicates via typed messages (`START`, `STOP`, `PROGRESS`, `DONE`, `ERROR`) with automatic main-thread fallback for Node/tests.
- **Timeline Simulator & Cost J**: Discrete-event simulator with skill scaling, route selection, and dynamic edge unblocking evaluated via $J = \alpha\cdot\text{makespan} + \beta\cdot\text{delay} + \gamma\cdot\text{unresolved}$.

## How to Run
- `npm run dev`: Launch Vite development server
- `npm run test`: Run Vitest unit tests (74 tests pass across 10 suites)
- `npm run typecheck`: Run TypeScript compiler check (browser & scripts)
- `npm run lint`: Run ESLint check
- `npm run build`: Build production bundle
