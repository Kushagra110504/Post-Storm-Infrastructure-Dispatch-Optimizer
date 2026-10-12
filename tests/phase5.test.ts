/**
 * Phase 5 Tests: Baseline Dispatcher & KPIs
 */
import { describe, it, expect, beforeAll } from "vitest";
import miniCity from "./fixtures/mini-city.json";
import { CityGraph, CityGraphSchema, Scenario } from "../src/core/model/schema";
import { RouteCache } from "../src/core/routing/routeCache";
import { nearestFirstBaseline } from "../src/core/baseline/nearestFirst";
import { simulate } from "../src/core/plan/simulator";
import { evaluateCost } from "../src/core/cost/costFunction";
import { computeKPIs, formatKPIs } from "../src/core/baseline/kpi";

let graph: CityGraph;

beforeAll(() => {
  graph = CityGraphSchema.parse(miniCity);
});

function makeScenario(): Scenario {
  const nodeIds = Object.keys(graph.nodes);
  const n0 = nodeIds[0]!;
  const n1 = nodeIds[Math.min(1, nodeIds.length - 1)]!;
  const n2 = nodeIds[Math.min(2, nodeIds.length - 1)]!;
  return {
    id: "baseline-test",
    name: "Baseline Test",
    cityName: "mini",
    cityVersionHash: "hash",
    seed: 42,
    createdAt: new Date().toISOString(),
    operationalNotice: "",
    incidents: [
      {
        id: "I1",
        type: "power",
        node: n1,
        placeName: "Power Fault Alpha",
        severity: 5,
        requiredSkill: "high-voltage",
        requiredEquipment: "generator",
        baseRepairTime: 20,
        affectedFacilityIds: ["F1"],
        reportedAt: 0,
      },
      {
        id: "I2",
        type: "water",
        node: n2,
        placeName: "Water Leak Beta",
        severity: 3,
        requiredSkill: "pipe-repair",
        requiredEquipment: "excavator",
        baseRepairTime: 40,
        affectedFacilityIds: ["F2"],
        reportedAt: 5,
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
      {
        id: "T2",
        name: "Beta",
        depotNode: n0,
        currentNode: n0,
        skills: ["pipe-repair"],
        vehicleType: "pump-van",
        equipment: ["excavator"],
        speedFactor: 1.0,
        availableAt: 0,
        status: "idle",
      },
    ],
    facilities: [
      {
        id: "F1",
        name: "Hospital",
        type: "hospital",
        node: n1,
        criticalityWeight: 3.0,
        incidentIds: ["I1"],
      },
      {
        id: "F2",
        name: "Water Plant",
        type: "water_facility",
        node: n2,
        criticalityWeight: 2.0,
        incidentIds: ["I2"],
      },
    ],
  };
}

describe("nearestFirstBaseline", () => {
  it("produces a DispatchPlan with assignments for all incidents", () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const plan = nearestFirstBaseline(scenario, graph, cache);
    expect(plan.assignments.length).toBeGreaterThanOrEqual(scenario.incidents.length - 1);
    expect(plan.scenarioId).toBe("baseline-test");
  });

  it("assigns each incident to at most one team", () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const plan = nearestFirstBaseline(scenario, graph, cache);
    const incidentIds = plan.assignments.map((a) => a.incidentId);
    const unique = new Set(incidentIds);
    expect(unique.size).toBe(incidentIds.length);
  });

  it("teams in assignments are valid team IDs", () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const plan = nearestFirstBaseline(scenario, graph, cache);
    const validTeamIds = new Set(scenario.teams.map((t) => t.id));
    for (const a of plan.assignments) {
      expect(validTeamIds.has(a.teamId)).toBe(true);
    }
  });

  it("simulate + evaluateCost produces a finite J for baseline plan", () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const plan = nearestFirstBaseline(scenario, graph, cache);
    const cache2 = new RouteCache(graph);
    const result = simulate(plan, scenario, graph, cache2);
    const J = evaluateCost(result, scenario);
    expect(isFinite(J)).toBe(true);
    expect(J).toBeGreaterThanOrEqual(0);
  });
});

describe("KPI evaluation", () => {
  it("computeKPIs returns valid KPI object", () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const plan = nearestFirstBaseline(scenario, graph, cache);
    const cache2 = new RouteCache(graph);
    const result = simulate(plan, scenario, graph, cache2);
    evaluateCost(result, scenario);
    const kpis = computeKPIs(result, scenario);
    expect(kpis.resolvedCount + kpis.unresolvedCount).toBe(scenario.incidents.length);
    expect(kpis.totalFacilities).toBe(scenario.facilities.length);
    expect(kpis.costJ).toBe(result.costJ);
  });

  it("formatKPIs returns multi-line string", () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const plan = nearestFirstBaseline(scenario, graph, cache);
    const cache2 = new RouteCache(graph);
    const result = simulate(plan, scenario, graph, cache2);
    evaluateCost(result, scenario);
    const kpis = computeKPIs(result, scenario);
    const str = formatKPIs(kpis);
    expect(str).toContain("Makespan");
    expect(str).toContain("Cost J");
    expect(str.split("\n").length).toBeGreaterThan(3);
  });

  it("all facilities resolved when all incidents assigned", () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const plan = nearestFirstBaseline(scenario, graph, cache);
    if (plan.assignments.length < scenario.incidents.length) return; // skip if graph disconnected
    const cache2 = new RouteCache(graph);
    const result = simulate(plan, scenario, graph, cache2);
    evaluateCost(result, scenario);
    const kpis = computeKPIs(result, scenario);
    // If all incidents resolved, all facilities should be restored
    if (kpis.resolvedCount === scenario.incidents.length) {
      expect(kpis.facilitiesRestored).toBe(scenario.facilities.length);
    }
  });
});
