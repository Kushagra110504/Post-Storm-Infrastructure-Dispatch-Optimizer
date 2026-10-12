import { CityGraph } from '../model/schema';

export interface RouteStep {
  fromNode: string;
  toNode: string;
  edgeId: string;
  distance: number;
  timeSeconds: number;
}

export interface RouteResult {
  path: string[]; // sequence of node IDs
  edges: string[]; // sequence of edge IDs
  totalDistance: number; // meters
  totalTimeSeconds: number; // seconds
}

export interface AdjacencyEdge {
  to: string;
  edgeId: string;
  length: number;
  speed: number;
  timeSeconds: number;
}

export type AdjacencyList = Map<string, AdjacencyEdge[]>;

/** Builds an adjacency list representation from CityGraph edges. */
export function buildAdjacencyList(graph: CityGraph): AdjacencyList {
  const adj: AdjacencyList = new Map();

  for (const edge of graph.edges) {
    const timeSec = (edge.length / Math.max(edge.speed, 5)) * 3.6; // (m / (km/h)) * 3.6 = sec

    // from -> to
    let fromList = adj.get(edge.from);
    if (!fromList) {
      fromList = [];
      adj.set(edge.from, fromList);
    }
    fromList.push({
      to: edge.to,
      edgeId: edge.id,
      length: edge.length,
      speed: edge.speed,
      timeSeconds: timeSec,
    });

    // If bidirectional, to -> from
    if (!edge.oneway) {
      let toList = adj.get(edge.to);
      if (!toList) {
        toList = [];
        adj.set(edge.to, toList);
      }
      toList.push({
        to: edge.from,
        edgeId: edge.id,
        length: edge.length,
        speed: edge.speed,
        timeSeconds: timeSec,
      });
    }
  }

  return adj;
}

/** Binary Min-Heap Priority Queue for fast Dijkstra operations. */
class MinHeap {
  private heap: Array<{ node: string; cost: number }> = [];

  push(node: string, cost: number): void {
    this.heap.push({ node, cost });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { node: string; cost: number } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIdx = (index - 1) >> 1;
      const current = this.heap[index]!;
      const parent = this.heap[parentIdx]!;
      if (current.cost >= parent.cost) break;
      this.heap[index] = parent;
      this.heap[parentIdx] = current;
      index = parentIdx;
    }
  }

  private bubbleDown(index: number): void {
    const len = this.heap.length;
    while (true) {
      const leftIdx = (index << 1) + 1;
      const rightIdx = leftIdx + 1;
      let smallest = index;

      if (leftIdx < len && this.heap[leftIdx]!.cost < this.heap[smallest]!.cost) {
        smallest = leftIdx;
      }
      if (rightIdx < len && this.heap[rightIdx]!.cost < this.heap[smallest]!.cost) {
        smallest = rightIdx;
      }
      if (smallest === index) break;

      const temp = this.heap[index]!;
      this.heap[index] = this.heap[smallest]!;
      this.heap[smallest] = temp;
      index = smallest;
    }
  }
}

/**
 * Computes shortest path between startNode and targetNode using Dijkstra's algorithm.
 * Weight can be distance (meters) or time (seconds).
 * Blocked edges are strictly excluded from traversal.
 */
export function dijkstra(
  graph: CityGraph,
  startNode: string,
  targetNode: string,
  blockedEdgeIds: Set<string> = new Set(),
  metric: 'distance' | 'time' = 'time',
  cachedAdj?: AdjacencyList,
): RouteResult | null {
  if (startNode === targetNode) {
    return {
      path: [startNode],
      edges: [],
      totalDistance: 0,
      totalTimeSeconds: 0,
    };
  }

  const adj = cachedAdj ?? buildAdjacencyList(graph);
  const distances = new Map<string, number>();
  const prev = new Map<string, { fromNode: string; edgeId: string; length: number; timeSec: number }>();
  const pq = new MinHeap();

  distances.set(startNode, 0);
  pq.push(startNode, 0);

  while (pq.size > 0) {
    const current = pq.pop()!;
    const u = current.node;
    const currentDist = current.cost;

    if (u === targetNode) break;

    const bestKnown = distances.get(u) ?? Infinity;
    if (currentDist > bestKnown) continue;

    const neighbors = adj.get(u);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (blockedEdgeIds.has(neighbor.edgeId)) continue;

      const edgeCost = metric === 'time' ? neighbor.timeSeconds : neighbor.length;
      const newCost = currentDist + edgeCost;
      const prevNeighborDist = distances.get(neighbor.to) ?? Infinity;

      if (newCost < prevNeighborDist) {
        distances.set(neighbor.to, newCost);
        prev.set(neighbor.to, {
          fromNode: u,
          edgeId: neighbor.edgeId,
          length: neighbor.length,
          timeSec: neighbor.timeSeconds,
        });
        pq.push(neighbor.to, newCost);
      }
    }
  }

  if (!prev.has(targetNode)) {
    return null; // No route exists
  }

  // Reconstruct path backwards
  const path: string[] = [];
  const edges: string[] = [];
  let totalDistance = 0;
  let totalTimeSeconds = 0;

  let curr = targetNode;
  path.push(curr);

  while (curr !== startNode) {
    const step = prev.get(curr);
    if (!step) break;
    edges.push(step.edgeId);
    totalDistance += step.length;
    totalTimeSeconds += step.timeSec;
    curr = step.fromNode;
    path.push(curr);
  }

  path.reverse();
  edges.reverse();

  return {
    path,
    edges,
    totalDistance,
    totalTimeSeconds,
  };
}
