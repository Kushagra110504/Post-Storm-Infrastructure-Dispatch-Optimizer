import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../src/state/store';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CityGraph, CityGraphSchema } from '../src/core/model/schema';
import { SpatialIndex } from '../src/core/graph/spatialIndex';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rawMiniCity = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/mini-city.json'), 'utf-8'),
);
const miniCityGraph: CityGraph = CityGraphSchema.parse(rawMiniCity);

describe('Road Blocking & Store State', () => {
  beforeEach(() => {
    useAppStore.setState({
      graph: miniCityGraph,
      places: [],
      spatialIndex: new SpatialIndex(miniCityGraph, 10),
      isMapLoaded: true,
      blockedEdgeIds: new Set<string>(),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  });

  it('initially has no blocked roads', () => {
    const { blockedEdgeIds } = useAppStore.getState();
    expect(blockedEdgeIds.size).toBe(0);
  });

  it('toggles an edge to blocked when clicked', () => {
    const edgeId = miniCityGraph.edges[0]!.id;
    useAppStore.getState().toggleEdgeBlock(edgeId);

    expect(useAppStore.getState().blockedEdgeIds.has(edgeId)).toBe(true);
    expect(useAppStore.getState().blockedEdgeIds.size).toBe(1);
  });

  it('toggles an edge back to unblocked when clicked again', () => {
    const edgeId = miniCityGraph.edges[0]!.id;
    useAppStore.getState().toggleEdgeBlock(edgeId);
    expect(useAppStore.getState().blockedEdgeIds.has(edgeId)).toBe(true);

    useAppStore.getState().toggleEdgeBlock(edgeId);
    expect(useAppStore.getState().blockedEdgeIds.has(edgeId)).toBe(false);
    expect(useAppStore.getState().blockedEdgeIds.size).toBe(0);
  });

  it('tracks multiple concurrently blocked edges', () => {
    const e1 = miniCityGraph.edges[0]!.id;
    const e2 = miniCityGraph.edges[1]!.id;
    const e3 = miniCityGraph.edges[2]!.id;

    useAppStore.getState().toggleEdgeBlock(e1);
    useAppStore.getState().toggleEdgeBlock(e2);
    useAppStore.getState().toggleEdgeBlock(e3);

    const { blockedEdgeIds } = useAppStore.getState();
    expect(blockedEdgeIds.size).toBe(3);
    expect(blockedEdgeIds.has(e1)).toBe(true);
    expect(blockedEdgeIds.has(e2)).toBe(true);
    expect(blockedEdgeIds.has(e3)).toBe(true);
  });

  it('explicitly sets edge blocked state using setEdgeBlocked', () => {
    const edgeId = miniCityGraph.edges[0]!.id;

    useAppStore.getState().setEdgeBlocked(edgeId, true);
    expect(useAppStore.getState().blockedEdgeIds.has(edgeId)).toBe(true);

    // Setting true again remains true without duplicates
    useAppStore.getState().setEdgeBlocked(edgeId, true);
    expect(useAppStore.getState().blockedEdgeIds.has(edgeId)).toBe(true);
    expect(useAppStore.getState().blockedEdgeIds.size).toBe(1);

    // Setting false unblocks it
    useAppStore.getState().setEdgeBlocked(edgeId, false);
    expect(useAppStore.getState().blockedEdgeIds.has(edgeId)).toBe(false);
    expect(useAppStore.getState().blockedEdgeIds.size).toBe(0);
  });

  it('clears all blocked edges with clearBlockedEdges', () => {
    for (const edge of miniCityGraph.edges.slice(0, 5)) {
      useAppStore.getState().toggleEdgeBlock(edge.id);
    }
    expect(useAppStore.getState().blockedEdgeIds.size).toBe(5);

    useAppStore.getState().clearBlockedEdges();
    expect(useAppStore.getState().blockedEdgeIds.size).toBe(0);
  });

  it('preserves edge properties in graph when blocked', () => {
    const edge = miniCityGraph.edges[0]!;
    useAppStore.getState().toggleEdgeBlock(edge.id);

    const retrieved = useAppStore.getState().graph?.edges.find(e => e.id === edge.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.length).toBe(edge.length);
    expect(retrieved?.speed).toBe(edge.speed);
    expect(retrieved?.geometry).toEqual(edge.geometry);
  });

  it('enforces immutable Set updates for React reactivity', () => {
    const edgeId = miniCityGraph.edges[0]!.id;
    const initialSet = useAppStore.getState().blockedEdgeIds;

    useAppStore.getState().toggleEdgeBlock(edgeId);
    const updatedSet = useAppStore.getState().blockedEdgeIds;

    expect(updatedSet).not.toBe(initialSet);
  });
});
