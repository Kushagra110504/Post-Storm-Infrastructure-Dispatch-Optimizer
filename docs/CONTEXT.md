# GridRescue: Project Context

## Current State
- **Phase**: 0 (Scaffold initialized)
- **Status**: Vite + React + TypeScript (strict) setup with Vitest, ESLint, Prettier, and basic control-room shell.
- **Test Count**: Initial test suite passing.

## Key Architectural Decisions
- **Optimizer Engine**: Seeded Hill Climbing (first-improvement + random restarts) offloaded to Web Worker.
- **Map & Routing**: 100% offline bundled OpenStreetMap vector data (Jaipur 6x6 km bbox) rendered in SVG; no map SDKs or external network requests.
- **Cost Function**: Multi-objective J = w1*T + w2*S + w3*D + w4*R evaluating response time, critical facility downtime, severity, and penalties.
- **Deterministic Simulation**: mulberry32 seeded PRNG for reproducible scenario generation and optimization runs.

## How to Run
- `npm install`: Install dependencies
- `npm run dev`: Launch Vite development server
- `npm run test`: Run Vitest unit tests
- `npm run typecheck`: Run TypeScript compiler check
- `npm run lint`: Run ESLint check
- `npm run build`: Build production bundle
