# GridRescue: Project Context

## Current State
- **Phase**: 3 (Domain & Scenario Engine completed)
- **Status**: Seeded 12/8/5 Jaipur scenario generator (12 incidents, 8 crews, 5 critical facilities) with guaranteed cross-incident dependencies and router-verified road blocking. Secure Zod import/export. Interactive scenario viewer with crew and facility inspectors.
- **Test Count**: 43 passing unit tests across 7 test suites.

## Key Architectural Decisions
- **12/8/5 Scenario Generator**: Deterministic by seed (Mulberry32). Generates 4 power, 3 water, 2 comms, 3 road incidents on real Jaipur OSM places with required skill/vehicle/equipment alignments.
- **Guaranteed Road Blocking**: Dijkstra router verifies a road incident blocks the shortest path to a hospital-linked power fault, ensuring dispatch ordering strictly matters.
- **Security & Schema**: Full Zod schema validation on scenario model; import guards against prototype pollution, file size > 1MB, and non-existent graph node/edge references.
- **UI Scenario Viewer**: Real incident and crew depot markers on SVG map with severity badges, dependency tags, and inspector tabs.

## How to Run
- `npm run dev`: Launch Vite development server
- `npm run test`: Run Vitest unit tests (all 43 tests pass)
- `npm run typecheck`: Run TypeScript compiler check (browser & scripts)
- `npm run lint`: Run ESLint check
- `npm run build`: Build production bundle
