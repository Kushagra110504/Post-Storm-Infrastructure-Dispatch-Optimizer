# GridRescue: Post-Storm Infrastructure Dispatch Optimizer

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-purple.svg)](https://vitejs.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-2.1-green.svg)](https://vitest.dev/)
[![License: ODbL](https://img.shields.io/badge/Map%20Data-OpenStreetMap%20ODbL-orange.svg)](https://www.openstreetmap.org/copyright)

**GridRescue** is an interactive, mission-critical control-room application that dispatches municipal infrastructure-repair crews after a storm and prioritizes service restoration on **real city road networks and places** (Jaipur, India).

At the heart of the engine is a pure, framework-free **Hill Climbing with Random Restarts** optimizer that navigates complex combinatorial assignment spaces, respects skill alignments, resolves dependency chains, detours around blocked roads, and minimizes downtime at critical facilities.

---

## Key Features

1. **Real-City Road Network & Offline Map Renderer**:
   - Bundled OpenStreetMap road network of Jaipur, India (contracted to intersection topology with speed-calibrated travel times).
   - High-performance offline SVG map renderer using equirectangular projection. Zero external tile servers, zero external SDKs.
   - Dynamic road blockage toggling with real-time route invalidation.

2. **Guaranteed Operational Complexity (12/8/5 Engine)**:
   - **12 Incidents**: 4 Power faults, 3 Water leaks, 2 Telecom outages, and 3 Road debris blockages.
   - **8 Specialized Crews**: Diverse vehicles (bucket trucks, pump vans), equipment (generators, excavators, splicers, chainsaws), and skill match proficiencies.
   - **5 Critical Facilities**: Hospitals, water pumping stations, telecom cores, and government emergency centers with priority weights.
   - **Blocking Road Rule**: Road incidents directly block shortest paths to hospital-linked faults, ensuring that clearing access roads first is necessary for optimal dispatch.

3. **Core Optimizer: Hill Climbing with Random Restarts**:
   - **3 Move Types**:
     - `swap-team`: Reallocates tasks to better-suited or idle crews.
     - `swap-route`: Selects alternative loop-free routes ($k=1..3$) via Yen-lite routing.
     - `swap-order`: Optimizes execution order within crew schedules so pre-requisite incidents and road clearances execute first.
   - **Random Restarts**: Overcomes local optima by restarting with diverse initial configurations.
   - **Decoupled Web Worker**: Optimization runs entirely in a dedicated Web Worker (`optimizer.worker.ts`), keeping the UI responsive at a locked 60 FPS.

4. **Mathematical Cost Function $J$**:
   $$\min J = \alpha \cdot \text{makespan} + \beta \cdot \sum_{f \in F} (w_f \cdot \Delta_f) + \gamma \cdot U$$
   - $\alpha = 1.0$: Total operation duration (minutes).
   - $\beta = 2.0$: Criticality-weighted facility restoration delay.
   - $\gamma = 500$: Large penalty deterrent per unresolved incident.

5. **Dynamic Mid-Operation Replanning & Warm Starts**:
   - Handles mid-operation disruptions (new emergency transformer faults, fallen trees, pipe bursts) at $t=t_{\text{now}}$.
   - **Locked History**: Work completed prior to $t_{\text{now}}$ is locked as immutable.
   - **Warm Start**: Hill climbing starts directly from the previous plan, adapting pending work in under 50ms.

6. **Plain-Language Explainability Engine**:
   - Computes diffs across all incident assignments (`NEW`, `REASSIGNED`, `REROUTED`, `UNCHANGED`).
   - Generates human-readable narratives explaining *why* crews were diverted and *what* the net KPI impact was.

7. **Security & Hardening**:
   - Strict Content Security Policy (CSP) meta tag.
   - Full Zod runtime validation for scenario import/export and Web Worker message channels.
   - Memory and coordinate bounds checks preventing prototype pollution and denial-of-service.

---

## Architecture

```
├── data/
│   ├── city.json              # Contracted Jaipur road network
│   ├── places.json            # Geo-referenced infrastructure places
│   └── ATTRIBUTION.md         # OpenStreetMap attribution (ODbL)
├── docs/
│   ├── PLAN.md                # Phase checklist & architecture
│   ├── CONTEXT.md             # Concise state & key architectural decisions
│   └── DEMO.md                # Interactive walkthrough demo script
├── scripts/
│   ├── benchmark.ts           # Standalone performance & throughput benchmark
│   ├── build-map-data.ts      # Pipeline for fetching/contracting OSM data
│   └── generate-mini-city.ts  # Fixture generator for fast testing
├── src/
│   ├── core/
│   │   ├── baseline/          # Nearest-first greedy dispatcher & KPI metrics
│   │   ├── cost/              # Objective function J evaluation
│   │   ├── explain/           # Plain-language explainer & plan diff engine
│   │   ├── graph/             # Spatial indexing & R-tree node picking
│   │   ├── hillclimb/         # Hill Climbing optimizer & move generators
│   │   ├── model/             # Domain schemas & Zod validators
│   │   ├── plan/              # Timeline simulator & discrete-event engine
│   │   ├── replan/            # Dynamic replanning with warm start
│   │   ├── rng/               # Deterministic Mulberry32 PRNG
│   │   ├── routing/           # Dijkstra & k-alternative routes
│   │   └── scenario/          # 12/8/5 Jaipur scenario generator & JSON I/O
│   ├── state/                 # Zustand application state store
│   ├── ui/                    # MapRenderer, ComparisonTable, ExplainPanel
│   └── workers/               # optimizer.worker.ts & OptimizerRunner client
└── tests/                     # 82 automated unit, integration, and benchmark tests
```

---

## Quick Start

### Prerequisites
- Node.js v18 or later
- npm v9 or later

### Installation
```bash
git clone https://github.com/example/grid-rescue.git
cd grid-rescue
npm install
```

### Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Test Suite
Run all 82 unit and integration tests across 12 test suites:
```bash
npm run test
```

### Performance Benchmark
Run the command-line optimization benchmark:
```bash
npm run benchmark
```
*Expected output: ~700–850 iterations/sec, >30% cost reduction in <40ms.*

### TypeScript & Lint Verification
```bash
npm run typecheck
npm run lint
```

### Production Build
```bash
npm run build
```

---

## Attribution & Data

- **Map Data**: [OpenStreetMap](https://www.openstreetmap.org/) contributors, licensed under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).
- See [data/ATTRIBUTION.md](file:///c:/Users/kushg/Downloads/AISC/data/ATTRIBUTION.md) for full licensing terms.
