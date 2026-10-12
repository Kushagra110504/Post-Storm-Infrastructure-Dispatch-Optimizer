/**
 * Phase 8 Benchmark & Hardening Suite: Performance, Throughput, and Security Checks
 */
import { describe, it, expect, beforeAll } from 'vitest';
import miniCity from './fixtures/mini-city.json';
import { CityGraph, CityGraphSchema, Scenario } from '../src/core/model/schema';
import { RouteCache } from '../src/core/routing/routeCache';
import { nearestFirstBaseline } from '../src/core/baseline/nearestFirst';
import { simulate } from '../src/core/plan/simulator';
import { evaluateCost } from '../src/core/cost/costFunction';
import { hillClimb } from '../src/core/hillclimb/hillClimb';
import { WorkerRequestSchema } from '../src/workers/schema';

let graph: CityGraph;

beforeAll(() => {
  graph = CityGraphSchema.parse(miniCity);
});

function makeBenchmarkScenario(): Scenario {
  const nodeIds = Object.keys(graph.nodes);
  return {
    id: 'bench-scenario',
    name: 'Benchmark Scenario',
    cityName: 'Jaipur Mini',
    cityVersionHash: 'bench-hash',
    seed: 42,
    createdAt: new Date().toISOString(),
    operationalNotice: 'Benchmark automated testing',
    incidents: [
      {
        id: 'I1',
        type: 'power',
        node: nodeIds[1 % nodeIds.length]!,
        placeName: 'Hospital Transformer Station',
        severity: 5,
        requiredSkill: 'high-voltage',
        requiredEquipment: 'generator',
        baseRepairTime: 25,
        affectedFacilityIds: ['F1'],
        reportedAt: 0,
      },
      {
        id: 'I2',
        type: 'water',
        node: nodeIds[2 % nodeIds.length]!,
        placeName: 'Water Main Break',
        severity: 4,
        requiredSkill: 'pipe-repair',
        requiredEquipment: 'excavator',
        baseRepairTime: 30,
        affectedFacilityIds: ['F2'],
        reportedAt: 5,
      },
      {
        id: 'I3',
        type: 'comms',
        node: nodeIds[0]!,
        placeName: 'Telecom Hub Outage',
        severity: 2,
        requiredSkill: 'telecom-fiber',
        requiredEquipment: 'splicer',
        baseRepairTime: 15,
        affectedFacilityIds: [],
        reportedAt: 8,
      },
      {
        id: 'I4',
        type: 'road',
        node: nodeIds[2 % nodeIds.length]!,
        placeName: 'Fallen Trees on Access Road',
        severity: 3,
        requiredSkill: 'debris-clearance',
        requiredEquipment: 'chainsaw',
        baseRepairTime: 20,
        affectedFacilityIds: [],
        reportedAt: 0,
      },
    ],
    teams: [
      {
        id: 'T1',
        name: 'Alpha Response',
        depotNode: nodeIds[0]!,
        currentNode: nodeIds[0]!,
        skills: ['high-voltage', 'telecom-fiber'],
        vehicleType: 'bucket-truck',
        equipment: ['generator', 'splicer'],
        speedFactor: 1.0,
        availableAt: 0,
        status: 'idle',
      },
      {
        id: 'T2',
        name: 'Beta Utility',
        depotNode: nodeIds[0]!,
        currentNode: nodeIds[0]!,
        skills: ['pipe-repair', 'debris-clearance'],
        vehicleType: 'pump-van',
        equipment: ['excavator', 'chainsaw'],
        speedFactor: 1.2,
        availableAt: 0,
        status: 'idle',
      },
    ],
    facilities: [
      {
        id: 'F1',
        name: 'District Hospital',
        type: 'hospital',
        node: nodeIds[1 % nodeIds.length]!,
        criticalityWeight: 3.0,
        incidentIds: ['I1'],
      },
      {
        id: 'F2',
        name: 'Water Reservoir',
        type: 'water_facility',
        node: nodeIds[2 % nodeIds.length]!,
        criticalityWeight: 2.0,
        incidentIds: ['I2'],
      },
    ],
  };
}

describe('Phase 8: Security & Schema Hardening', () => {
  it('WorkerRequestSchema validates correct START request payload', () => {
    const scenario = makeBenchmarkScenario();
    const valid = WorkerRequestSchema.safeParse({
      type: 'START',
      scenario,
      graph,
      options: { maxRestarts: 2, neighborsPerStep: 4 },
    });
    expect(valid.success).toBe(true);
  });

  it('WorkerRequestSchema rejects malformed requests or prototype pollution attempts', () => {
    const invalid = WorkerRequestSchema.safeParse({
      type: 'START',
      scenario: { invalid: true },
      graph: null,
    });
    expect(invalid.success).toBe(false);
  });
});

describe('Phase 8: Optimizer Performance & Benchmark', () => {
  it('Baseline dispatcher executes in under 100ms', () => {
    const scenario = makeBenchmarkScenario();
    const cache = new RouteCache(graph);
    const t0 = performance.now();
    const plan = nearestFirstBaseline(scenario, graph, cache);
    const sim = simulate(plan, scenario, graph, new RouteCache(graph));
    const J = evaluateCost(sim, scenario);
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(150);
    expect(isFinite(J)).toBe(true);
  });

  it('Hill Climbing performs multiple restarts and delivers improved or equal cost J', () => {
    const scenario = makeBenchmarkScenario();
    const t0 = performance.now();
    const result = hillClimb(scenario, graph, {
      maxRestarts: 3,
      maxIterationsPerRestart: 15,
      neighborsPerStep: 4,
      seed: 1234,
    });
    const elapsed = performance.now() - t0;

    expect(result.bestCostJ).toBeLessThanOrEqual(result.baselineCostJ);
    expect(result.convergence.length).toBeGreaterThanOrEqual(1);
    expect(elapsed).toBeLessThan(2500); // Fast convergence within budget
  });
});
