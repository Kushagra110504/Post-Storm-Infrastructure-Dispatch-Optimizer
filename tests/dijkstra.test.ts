import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CityGraph, CityGraphSchema } from '../src/core/model/schema';
import { dijkstra, buildAdjacencyList } from '../src/core/routing/dijkstra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rawMiniCity = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/mini-city.json'), 'utf-8'),
);
const miniCityGraph: CityGraph = CityGraphSchema.parse(rawMiniCity);

describe('Dijkstra Routing', () => {
  const adj = buildAdjacencyList(miniCityGraph);

  it('computes trivial path from node to itself with 0 cost', () => {
    const route = dijkstra(miniCityGraph, 'mini_n_0_0', 'mini_n_0_0', new Set(), 'distance', adj);
    expect(route).not.toBeNull();
    expect(route?.totalDistance).toBe(0);
    expect(route?.path).toEqual(['mini_n_0_0']);
  });

  it('finds direct shortest path between adjacent nodes', () => {
    const route = dijkstra(miniCityGraph, 'mini_n_0_0', 'mini_n_0_1', new Set(), 'distance', adj);
    expect(route).not.toBeNull();
    expect(route?.path).toEqual(['mini_n_0_0', 'mini_n_0_1']);
    expect(route?.edges.length).toBe(1);
    expect(route?.totalDistance).toBeCloseTo(495.8, 1);
  });

  it('detours around a blocked edge if an alternative path exists', () => {
    // Normal shortest path between (0,0) and (1,1)
    const normalRoute = dijkstra(miniCityGraph, 'mini_n_0_0', 'mini_n_1_1', new Set(), 'distance', adj);
    expect(normalRoute).not.toBeNull();
    const directEdge = normalRoute!.edges[0]!;

    // Block the primary edge used in the route
    const blocked = new Set([directEdge]);
    const detouredRoute = dijkstra(miniCityGraph, 'mini_n_0_0', 'mini_n_1_1', blocked, 'distance', adj);

    expect(detouredRoute).not.toBeNull();
    expect(detouredRoute!.edges).not.toContain(directEdge);
    expect(detouredRoute!.totalDistance).toBeGreaterThanOrEqual(normalRoute!.totalDistance);
  });

  it('returns null if all routes are blocked', () => {
    // Block all edges leaving the start node
    const leavingEdges = miniCityGraph.edges.filter(
      e => e.from === 'mini_n_0_0' || (!e.oneway && e.to === 'mini_n_0_0'),
    );
    const blockedAll = new Set(leavingEdges.map(e => e.id));

    const route = dijkstra(miniCityGraph, 'mini_n_0_0', 'mini_n_3_3', blockedAll, 'distance', adj);
    expect(route).toBeNull();
  });
});
