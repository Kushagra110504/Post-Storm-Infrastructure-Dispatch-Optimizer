# GridRescue: Project Context

## Current State
- **Phase**: 1 (Real map data pipeline completed)
- **Status**: Jaipur OSM data extracted (5,920 nodes, 8,064 edges, 118 real places), graph contracted, Zod validated, mini-city fixture committed.
- **Test Count**: 9 passing unit tests (2 RNG, 7 map-data & topology).

## Key Architectural Decisions
- **City**: Jaipur, Rajasthan, India (bbox 26.89-26.94 N, 75.79-75.84 E; ~5.0 x 5.6 km).
- **Graph Contraction**: Degree-2 nodes contracted into composite road edges while preserving multi-point polyline curves in `edge.geometry`.
- **Offline Delivery**: Static bundled `data/city.json` and `data/places.json`; offline fallback via `--input <file.osm.json>` and `tests/fixtures/mini-city.json`.
- **Validation**: Strict Zod schemas for nodes, edges, bbox, places, and graph.

## How to Run
- `npm run dev`: Launch Vite development server
- `npm run test`: Run Vitest unit tests (all 9 tests pass)
- `npm run typecheck`: Run TypeScript compiler check
- `npm run lint`: Run ESLint check
- `npm run build`: Build production bundle
- `npx tsx scripts/build-map-data.ts --stats`: Print map dataset statistics
