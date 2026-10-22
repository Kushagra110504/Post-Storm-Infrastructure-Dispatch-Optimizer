/**
 * Yen''s K-Shortest Paths (Yen-lite) using Dijkstra as the sub-solver.
 * Returns up to k loop-free paths from start to target, ordered by totalTimeSeconds.
 */
import { CityGraph } from "../model/schema";
import { RouteResult, AdjacencyList, buildAdjacencyList, dijkstra } from "./dijkstra";

export interface KRoutesResult {
  routes: RouteResult[];
}

export function kShortestPaths(
  graph: CityGraph,
  start: string,
  target: string,
  k = 3,
  extraBlockedEdges: Set<string> = new Set(),
  cachedAdj?: AdjacencyList
): KRoutesResult {
  const adj = cachedAdj ?? buildAdjacencyList(graph);
  const A: RouteResult[] = [];
  const B: RouteResult[] = [];

  const firstRoute = dijkstra(graph, start, target, extraBlockedEdges, "time", adj);
  if (!firstRoute) return { routes: [] };
  A.push(firstRoute);
  if (k <= 1) return { routes: A };

  // Pre-build edge map for O(1) attribute lookup
  const edgeMap = new Map<string, { length: number; speed: number }>();
  for (const e of graph.edges) {
    edgeMap.set(e.id, { length: e.length, speed: e.speed });
  }

  for (let kIdx = 1; kIdx < k; kIdx++) {
    const prevRoute = A[kIdx - 1]!;
    // Stride intermediate spur evaluations for efficiency on large graphs
    const stepSize = Math.max(1, Math.floor(prevRoute.path.length / 10));

    for (let i = 0; i < prevRoute.path.length - 1; i += stepSize) {
      const spurNode = prevRoute.path[i]!;
      const rootPath = prevRoute.path.slice(0, i + 1);
      const rootEdges = prevRoute.edges.slice(0, i);

      const blocked = new Set<string>(extraBlockedEdges);
      for (const prevA of A) {
        if (prevA.path.length > i && pathsShareRoot(prevA.path, rootPath)) {
          const edgeToBlock = prevA.edges[i];
          if (edgeToBlock) blocked.add(edgeToBlock);
        }
      }

      // Block edges connected to root nodes (excluding spurNode) via adjacency list in O(degree)
      const rootNodes = rootPath.slice(0, -1);
      for (const rn of rootNodes) {
        const neighbors = adj.get(rn);
        if (neighbors) {
          for (const nb of neighbors) {
            blocked.add(nb.edgeId);
          }
        }
      }

      const spurRoute = dijkstra(graph, spurNode, target, blocked, "time", adj);
      if (!spurRoute) continue;

      const totalPath = [...rootPath, ...spurRoute.path.slice(1)];
      const totalEdges = [...rootEdges, ...spurRoute.edges];

      let totalTimeSeconds = 0;
      let totalDistance = 0;
      for (const edgeId of totalEdges) {
        const edge = edgeMap.get(edgeId);
        if (edge) {
          totalTimeSeconds += (edge.length / Math.max(edge.speed, 5)) * 3.6;
          totalDistance += edge.length;
        }
      }

      const candidate: RouteResult = { path: totalPath, edges: totalEdges, totalDistance, totalTimeSeconds };
      const candidateKey = pathKey(candidate);
      if (!B.some((b) => pathKey(b) === candidateKey) && !A.some((a) => pathKey(a) === candidateKey)) {
        B.push(candidate);
      }
    }

    if (B.length === 0) break;
    B.sort((a, b) => a.totalTimeSeconds - b.totalTimeSeconds);
    A.push(B.shift()!);
  }

  return { routes: A };
}

function pathsShareRoot(pathA: string[], rootPath: string[]): boolean {
  for (let i = 0; i < rootPath.length; i++) {
    if (pathA[i] !== rootPath[i]) return false;
  }
  return true;
}

function pathKey(r: RouteResult): string {
  return r.edges.join(",");
}
