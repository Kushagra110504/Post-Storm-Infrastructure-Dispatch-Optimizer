/**
 * Route Cache — memoizes Dijkstra results keyed by (start, target, blockedEdges).
 * Caches are invalidated when the blocked-edge set changes.
 */
import { CityGraph } from "../model/schema";
import { RouteResult, AdjacencyList, buildAdjacencyList, dijkstra } from "./dijkstra";
import { kShortestPaths, KRoutesResult } from "./kShortest";

export class RouteCache {
  private readonly adj: AdjacencyList;
  private readonly cache = new Map<string, RouteResult | null>();
  private readonly kCache = new Map<string, KRoutesResult>();

  constructor(graph: CityGraph) {
    this.adj = buildAdjacencyList(graph);
  }

  /** Rebuild adjacency on graph mutation (edge block/unblock). */
  invalidate(): void {
    this.cache.clear();
    this.kCache.clear();
  }

  private cacheKey(start: string, target: string, blocked: Set<string>): string {
    const sortedBlocked = [...blocked].sort().join("|");
    return `${start}::${target}::${sortedBlocked}`;
  }

  getRoute(
    graph: CityGraph,
    start: string,
    target: string,
    blockedEdges: Set<string> = new Set(),
    metric: "distance" | "time" = "time"
  ): RouteResult | null {
    const key = this.cacheKey(start, target, blockedEdges) + `:${metric}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const result = dijkstra(graph, start, target, blockedEdges, metric, this.adj);
    this.cache.set(key, result);
    return result;
  }

  getKRoutes(
    graph: CityGraph,
    start: string,
    target: string,
    k = 3,
    blockedEdges: Set<string> = new Set()
  ): KRoutesResult {
    const key = this.cacheKey(start, target, blockedEdges) + `:k${k}`;
    if (this.kCache.has(key)) return this.kCache.get(key)!;
    const result = kShortestPaths(graph, start, target, k, blockedEdges, this.adj);
    this.kCache.set(key, result);
    return result;
  }
}
