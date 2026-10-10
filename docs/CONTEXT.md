# GridRescue: Project Context

## Current State
- **Phase**: 2 (Offline SVG Map Renderer completed)
- **Status**: 100% offline GPU-accelerated SVG map engine with pan/zoom, LOD hierarchy, real facility markers/labels, spatial index picking, and road click-to-block interaction.
- **Test Count**: 28 passing unit tests (2 RNG, 7 map-data, 5 projection, 6 spatial-index, 8 road-blocking).

## Key Architectural Decisions
- **Offline SVG Rendering**: Pre-projected metric coordinates transformed via SVG `<g>` matrix; zero external tile SDKs or runtime network calls.
- **LOD Pipeline**: Scale-aware road culling (motorways -> primary -> secondary -> all) and facility visibility ensures 60 FPS performance on 8,000+ edges.
- **Spatial Index**: Uniform 2D grid index with boundary clamping for O(1) nearest-node and nearest-edge picking.
- **Road Blocking**: Interactive stroke hit targets toggle road closures with glowing hazard markers; managed reactively via immutable Zustand store.

## How to Run
- `npm run dev`: Launch Vite development server
- `npm run test`: Run Vitest unit tests (all 28 tests pass)
- `npm run typecheck`: Run TypeScript compiler check (both browser and script tsconfigs)
- `npm run lint`: Run ESLint check
- `npm run build`: Build production bundle
