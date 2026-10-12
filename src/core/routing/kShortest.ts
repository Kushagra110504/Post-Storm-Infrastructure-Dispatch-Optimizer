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

  for (let kIdx = 1; kIdx < k; kIdx++) {
    const prevRoute = A[kIdx - 1]!;

    for (let i = 0; i < prevRoute.path.length - 1; i++) {
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
      const rootNodeSet = new Set(rootPath.slice(0, -1));
      for (const edge of graph.edges) {
        if (edge.from !== spurNode && rootNodeSet.has(edge.from)) blocked.add(edge.id);
        if (edge.to !== spurNode && rootNodeSet.has(edge.to)) blocked.add(edge.id);
      }

      const spurRoute = dijkstra(graph, spurNode, target, blocked, "time", adj);
      if (!spurRoute) continue;

      const totalPath = [...rootPath, ...spurRoute.path.slice(1)];
      const totalEdges = [...rootEdges, ...spurRoute.edges];

      let totalTimeSeconds = 0;
      let totalDistance = 0;
      for (const edgeId of totalEdges) {
        const edge = graph.edges.find((e) => e.id === edgeId);
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
