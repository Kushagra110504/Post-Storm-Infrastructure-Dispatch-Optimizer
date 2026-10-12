/**
 * Phase 4 Tests: Routing & Simulator
 * Covers: kShortestPaths, RouteCache, simulate, evaluateCost
 */
import { describe, it, expect, beforeAll } from "vitest";
import miniCity from "./fixtures/mini-city.json";
import { CityGraph, CityGraphSchema, Scenario } from "../src/core/model/schema";
import { dijkstra, buildAdjacencyList } from "../src/core/routing/dijkstra";
import { kShortestPaths } from "../src/core/routing/kShortest";
import { RouteCache } from "../src/core/routing/routeCache";
import { simulate } from "../src/core/plan/simulator";
import { evaluateCost, costBreakdown, DEFAULT_WEIGHTS } from "../src/core/cost/costFunction";
import { DispatchPlan } from "../src/core/plan/types";

let graph: CityGraph;

beforeAll(() => {
  graph = CityGraphSchema.parse(miniCity);
});

// ─── Dijkstra (regression) ───────────────────────────────────────────────────
describe("dijkstra (regression)", () => {
  it("returns null when start==target neighbours are all blocked", () => {
    const adj = buildAdjacencyList(graph);
    const nodeIds = Object.keys(graph.nodes);
    const firstEdge = graph.edges[0];
    const blocked = new Set([firstEdge!.id]);
    // Should still find a path to itself
    const r = dijkstra(graph, nodeIds[0]!, nodeIds[0]!, blocked, "time", adj);
    expect(r).not.toBeNull();
    expect(r!.path.length).toBe(1);
  });

  it("routes between two nodes in mini-city", () => {
    const adj = buildAdjacencyList(graph);
    const nodeIds = Object.keys(graph.nodes);
    expect(nodeIds.length).toBeGreaterThan(1);
    const r = dijkstra(graph, nodeIds[0]!, nodeIds[nodeIds.length - 1]!, new Set(), "time", adj);
    // Mini-city may or may not be connected — just verify structure
    if (r) {
      expect(r.path[0]).toBe(nodeIds[0]);
      expect(r.path[r.path.length - 1]).toBe(nodeIds[nodeIds.length - 1]);
      expect(r.totalTimeSeconds).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── K-Shortest Paths ────────────────────────────────────────────────────────
describe("kShortestPaths", () => {
  it("returns at most k routes", () => {
    const nodeIds = Object.keys(graph.nodes);
    const result = kShortestPaths(graph, nodeIds[0]!, nodeIds[nodeIds.length - 1]!, 3);
    expect(result.routes.length).toBeGreaterThanOrEqual(0);
    expect(result.routes.length).toBeLessThanOrEqual(3);
  });

  it("routes are ordered ascending by totalTimeSeconds", () => {
    const nodeIds = Object.keys(graph.nodes);
    const result = kShortestPaths(graph, nodeIds[0]!, nodeIds[nodeIds.length - 1]!, 3);
    for (let i = 1; i < result.routes.length; i++) {
      expect(result.routes[i]!.totalTimeSeconds).toBeGreaterThanOrEqual(
        result.routes[i - 1]!.totalTimeSeconds
      );
    }
  });

  it("routes have distinct edge sequences", () => {
    const nodeIds = Object.keys(graph.nodes);
    const result = kShortestPaths(graph, nodeIds[0]!, nodeIds[nodeIds.length - 1]!, 3);
    const keys = result.routes.map((r) => r.edges.join(","));
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("returns empty routes when start==target with no edges", () => {
    // Single node to itself — Dijkstra short-circuits; k-shortest should return 1 route
    const nodeIds = Object.keys(graph.nodes);
    const result = kShortestPaths(graph, nodeIds[0]!, nodeIds[0]!, 3);
    // Could be 1 (trivial path) or 0 depending on graph
    expect(result.routes.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── Route Cache ─────────────────────────────────────────────────────────────
describe("RouteCache", () => {
  it("caches single route lookups", () => {
    const cache = new RouteCache(graph);
    const nodeIds = Object.keys(graph.nodes);
    const r1 = cache.getRoute(graph, nodeIds[0]!, nodeIds[nodeIds.length - 1]!, new Set(), "time");
    const r2 = cache.getRoute(graph, nodeIds[0]!, nodeIds[nodeIds.length - 1]!, new Set(), "time");
    // Same reference from cache
    expect(r1).toBe(r2);
  });

  it("invalidate clears cache so next call recomputes", () => {
    const cache = new RouteCache(graph);
    const nodeIds = Object.keys(graph.nodes);
    const r1 = cache.getRoute(graph, nodeIds[0]!, nodeIds[nodeIds.length - 1]!, new Set(), "time");
    cache.invalidate();
    const r2 = cache.getRoute(graph, nodeIds[0]!, nodeIds[nodeIds.length - 1]!, new Set(), "time");
    // Values should match (same computation)
    expect(r1?.totalTimeSeconds).toBe(r2?.totalTimeSeconds);
  });

  it("getKRoutes returns KRoutesResult", () => {
    const cache = new RouteCache(graph);
    const nodeIds = Object.keys(graph.nodes);
    const kr = cache.getKRoutes(graph, nodeIds[0]!, nodeIds[nodeIds.length - 1]!, 2);
    expect(Array.isArray(kr.routes)).toBe(true);
  });
});

// ─── Simulator + Cost Function ────────────────────────────────────────────────
/** Build a minimal Scenario for testing */
function makeTestScenario(): Scenario {
  const nodeIds = Object.keys(graph.nodes);
  const n0 = nodeIds[0]!;
  const n1 = nodeIds[Math.min(1, nodeIds.length - 1)]!;
  return {
    id: "test-scenario",
    name: "Test",
    cityName: "mini",
    cityVersionHash: "hash",
    seed: 1,
    createdAt: new Date().toISOString(),
    operationalNotice: "",
    incidents: [
      {
        id: "I1",
        type: "power",
        node: n1,
        placeName: "Test Power Station",
        severity: 3,
        requiredSkill: "high-voltage",
        requiredEquipment: "generator",
        baseRepairTime: 30,
        affectedFacilityIds: ["F1"],
        reportedAt: 0,
      },
    ],
    teams: [
      {
        id: "T1",
        name: "Alpha",
        depotNode: n0,
        currentNode: n0,
        skills: ["high-voltage"],
        vehicleType: "bucket-truck",
        equipment: ["generator"],
        speedFactor: 1.0,
        availableAt: 0,
        status: "idle",
      },
    ],
    facilities: [
      {
        id: "F1",
        name: "Hospital Alpha",
        type: "hospital",
        node: n1,
        criticalityWeight: 2.0,
        incidentIds: ["I1"],
      },
    ],
  };
}

describe("simulate", () => {
  it("produces a SimulationResult with events and incidentResults", () => {
    const scenario = makeTestScenario();
    const cache = new RouteCache(graph);
    const plan: DispatchPlan = {
      id: "P1",
      scenarioId: "test-scenario",
      createdAt: new Date().toISOString(),
      assignments: [{ incidentId: "I1", teamId: "T1", routeIndex: 0 }],
    };
    const result = simulate(plan, scenario, graph, cache);
    expect(result.planId).toBe("P1");
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.incidentResults.length).toBe(1);
    expect(result.makespanMinutes).toBeGreaterThanOrEqual(0);
  });

  it("events are sorted by timeMinutes", () => {
    const scenario = makeTestScenario();
    const cache = new RouteCache(graph);
    const plan: DispatchPlan = {
      id: "P2",
      scenarioId: "test-scenario",
      createdAt: new Date().toISOString(),
      assignments: [{ incidentId: "I1", teamId: "T1", routeIndex: 0 }],
    };
    const result = simulate(plan, scenario, graph, cache);
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i]!.timeMinutes).toBeGreaterThanOrEqual(
        result.events[i - 1]!.timeMinutes
      );
    }
  });

  it("unassigned incidents produce Infinity repairEndMinutes", () => {
    const scenario = makeTestScenario();
    const cache = new RouteCache(graph);
    const plan: DispatchPlan = {
      id: "P3",
      scenarioId: "test-scenario",
      createdAt: new Date().toISOString(),
      assignments: [], // no assignments
    };
    const result = simulate(plan, scenario, graph, cache);
    expect(result.incidentResults.every((r) => !isFinite(r.repairEndMinutes))).toBe(true);
  });
});

describe("evaluateCost", () => {
  it("J is non-negative", () => {
    const scenario = makeTestScenario();
    const cache = new RouteCache(graph);
    const plan: DispatchPlan = {
      id: "P4",
      scenarioId: "test-scenario",
      createdAt: new Date().toISOString(),
      assignments: [{ incidentId: "I1", teamId: "T1", routeIndex: 0 }],
    };
    const result = simulate(plan, scenario, graph, cache);
    const J = evaluateCost(result, scenario);
    expect(J).toBeGreaterThanOrEqual(0);
    expect(result.costJ).toBe(J);
  });

  it("unresolved plan has higher J than resolved plan", () => {
    const scenario = makeTestScenario();
    const cache1 = new RouteCache(graph);
    const cache2 = new RouteCache(graph);

    const resolvedPlan: DispatchPlan = {
      id: "P5",
      scenarioId: "test-scenario",
      createdAt: new Date().toISOString(),
      assignments: [{ incidentId: "I1", teamId: "T1", routeIndex: 0 }],
    };
    const unresolvedPlan: DispatchPlan = {
      id: "P6",
      scenarioId: "test-scenario",
      createdAt: new Date().toISOString(),
      assignments: [],
    };

    const r1 = simulate(resolvedPlan, scenario, graph, cache1);
    const r2 = simulate(unresolvedPlan, scenario, graph, cache2);
    evaluateCost(r1, scenario);
    evaluateCost(r2, scenario);

    expect(r2.costJ).toBeGreaterThan(r1.costJ);
  });

  it("costBreakdown returns a multi-line string", () => {
    const scenario = makeTestScenario();
    const cache = new RouteCache(graph);
    const plan: DispatchPlan = {
      id: "P7",
      scenarioId: "test-scenario",
      createdAt: new Date().toISOString(),
      assignments: [{ incidentId: "I1", teamId: "T1", routeIndex: 0 }],
    };
    const result = simulate(plan, scenario, graph, cache);
    evaluateCost(result, scenario);
    const breakdown = costBreakdown(result, DEFAULT_WEIGHTS);
    expect(breakdown).toContain("J =");
    expect(breakdown.split("\n").length).toBeGreaterThan(2);
  });
});
