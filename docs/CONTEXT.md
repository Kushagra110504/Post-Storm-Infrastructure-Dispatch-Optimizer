# GridRescue: Project Context

## Current State
- **Phase**: 7 (Dynamic Replanning & Explainability completed)
- **Status**: Warm-start dynamic replanning mid-operation (`dynamicReplan`) with locked task preservation for completed work. Disruption injection triggers (hospital fault, arterial blockage, water failure). Plain-language explainability engine (`explainPlanDiff`) and UI ExplainPanel displaying human-readable narratives, plan diff badges, and KPI deltas.
- **Test Count**: 78 passing unit tests across 11 test suites.

## Key Architectural Decisions
- **12/8/5 Scenario Generator**: Deterministic by seed (Mulberry32). Generates 4 power, 3 water, 2 comms, 3 road incidents on real Jaipur OSM places with required skill/vehicle/equipment alignments.
- **Guaranteed Road Blocking**: Dijkstra router verifies a road incident blocks shortest path to hospital power fault, ensuring dispatch ordering strictly matters.
- **Security & Schema**: Full Zod schema validation; guards against prototype pollution, >1MB files, and invalid node/edge references.
- **Hill Climbing Engine**: 3 move types (`swap-team`, `swap-route`, `swap-order`), random restarts on local minima, monotonic best-J tracking, and parameterization (seed, maxRestarts, maxIterations).
- **Web Worker Decoupling**: Background `optimizer.worker.ts` communicates via typed messages (`START`, `STOP`, `PROGRESS`, `DONE`, `ERROR`) with automatic main-thread fallback for Node/tests.
- **Warm-Start Replanning**: Preserves completed incidents at $t=t_{\text{now}}$ as immutable prefixes while warm-starting Hill Climbing on active and pending tasks with new disruption arrivals.
- **Explainability Engine**: Computes assignment diffs (`NEW`, `REASSIGNED`, `REROUTED`, `UNCHANGED`), KPI deltas, and natural language narrative explaining why changes were made.

## How to Run
- `npm run dev`: Launch Vite development server
- `npm run test`: Run Vitest unit tests (78 tests pass across 11 suites)
- `npm run typecheck`: Run TypeScript compiler check (browser & scripts)
- `npm run lint`: Run ESLint check
- `npm run build`: Build production bundle
