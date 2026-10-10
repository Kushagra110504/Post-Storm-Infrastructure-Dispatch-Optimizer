import { describe, it, expect } from 'vitest';
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

describe('SpatialIndex', () => {
  const index = new SpatialIndex(miniCityGraph, 10);

  it('accurately finds nearest node when queried at exact node coordinates', () => {
    for (const [id, node] of Object.entries(miniCityGraph.nodes)) {
      const foundId = index.nearestNode(node.x, node.y);
      expect(foundId).toBe(id);
    }
  });

  it('matches brute-force nearest node for arbitrary query points', () => {
    const testPoints = [
      { x: 250, y: 500 },
      { x: 1200, y: 1500 },
      { x: 2800, y: 3200 },
      { x: 50, y: 3800 },
      { x: 3400, y: 100 },
    ];

    for (const pt of testPoints) {
      const indexedResult = index.nearestNode(pt.x, pt.y);

      // Brute force search
      let bestDist = Infinity;
      let bruteResult: string | null = null;
      for (const [id, node] of Object.entries(miniCityGraph.nodes)) {
        const dx = node.x - pt.x;
        const dy = node.y - pt.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          bruteResult = id;
        }
      }

      expect(indexedResult).toBe(bruteResult);
    }
  });

  it('correctly returns all nodes within a given radius', () => {
    const centerNode = miniCityGraph.nodes['mini_n_0_0']!;
    const radius = 600; // should capture n_0_0 and n_0_1 (at ~495m)
    const nearby = index.nodesWithinRadius(centerNode.x, centerNode.y, radius);

    expect(nearby).toContain('mini_n_0_0');
    expect(nearby).toContain('mini_n_0_1');

    // Verify all returned nodes are strictly within radius
    for (const id of nearby) {
      const n = miniCityGraph.nodes[id]!;
      const d = Math.sqrt((n.x - centerNode.x) ** 2 + (n.y - centerNode.y) ** 2);
      expect(d).toBeLessThanOrEqual(radius);
    }
  });

  it('identifies nearest edge to query point', () => {
    // Pick the first edge
    const edge = miniCityGraph.edges[0]!;
    const fromNode = miniCityGraph.nodes[edge.from]!;
    const toNode = miniCityGraph.nodes[edge.to]!;

    // Query at midpoint of the edge
    const midX = (fromNode.x + toNode.x) / 2;
    const midY = (fromNode.y + toNode.y) / 2;

    const foundEdge = index.nearestEdge(midX, midY, 50);
    expect(foundEdge).not.toBeNull();
    expect(foundEdge?.id).toBe(edge.id);
  });

  it('returns null when nearest edge exceeds max distance threshold', () => {
    // Point far away from any edge
    const farResult = index.nearestEdge(-5000, -5000, 50);
    expect(farResult).toBeNull();
  });

  it('gracefully handles boundary and out-of-range queries', () => {
    expect(index.nearestNode(-100, -100)).not.toBeNull();
    expect(index.nearestNode(10000, 10000)).not.toBeNull();
  });
});
