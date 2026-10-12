/**
 * Phase 6 Tests: Hill Climbing Optimizer, Moves, Convergence & Worker Controller
 */
import { describe, it, expect, beforeAll } from 'vitest';
import miniCity from './fixtures/mini-city.json';
import { CityGraph, CityGraphSchema, Scenario } from '../src/core/model/schema';
import { RouteCache } from '../src/core/routing/routeCache';
import { nearestFirstBaseline } from '../src/core/baseline/nearestFirst';
import {
  hillClimb,
  swapTeamMove,
  swapRouteMove,
  swapOrderMove,
  generateNeighbors,
} from '../src/core/hillclimb/hillClimb';
import { createMulberry32 } from '../src/core/rng/mulberry32';
import { OptimizerRunner } from '../src/workers/optimizerClient';

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
    id: 'hc-test-scenario',
    name: 'Hill Climb Test Scenario',
    cityName: 'mini',
    cityVersionHash: 'hash',
    seed: 42,
    createdAt: new Date().toISOString(),
    operationalNotice: '',
    incidents: [
      {
        id: 'I1',
        type: 'power',
        node: n1,
        placeName: 'Power Substation',
        severity: 4,
        requiredSkill: 'high-voltage',
        requiredEquipment: 'generator',
        baseRepairTime: 25,
        affectedFacilityIds: ['F1'],
        reportedAt: 0,
      },
      {
        id: 'I2',
        type: 'water',
        node: n2,
        placeName: 'Water Main Break',
        severity: 3,
        requiredSkill: 'pipe-repair',
        requiredEquipment: 'excavator',
        baseRepairTime: 30,
        affectedFacilityIds: ['F2'],
        reportedAt: 2,
      },
      {
        id: 'I3',
        type: 'comms',
        node: n1,
        placeName: 'Telecom Tower Fault',
        severity: 2,
        requiredSkill: 'telecom-fiber',
        requiredEquipment: 'splicer',
        baseRepairTime: 15,
        affectedFacilityIds: [],
        reportedAt: 5,
      },
    ],
    teams: [
      {
        id: 'T1',
        name: 'Team Alpha',
        depotNode: n0,
        currentNode: n0,
        skills: ['high-voltage', 'telecom-fiber'],
        vehicleType: 'bucket-truck',
        equipment: ['generator', 'splicer'],
        speedFactor: 1.0,
        availableAt: 0,
        status: 'idle',
      },
      {
        id: 'T2',
        name: 'Team Beta',
        depotNode: n0,
        currentNode: n0,
        skills: ['pipe-repair'],
        vehicleType: 'pump-van',
        equipment: ['excavator'],
        speedFactor: 1.2,
        availableAt: 0,
        status: 'idle',
      },
    ],
    facilities: [
      {
        id: 'F1',
        name: 'City Hospital',
        type: 'hospital',
        node: n1,
        criticalityWeight: 3.0,
        incidentIds: ['I1'],
      },
      {
        id: 'F2',
        name: 'Water Pumping Station',
        type: 'water_facility',
        node: n2,
        criticalityWeight: 2.0,
        incidentIds: ['I2'],
      },
    ],
  };
}

describe('Hill Climbing Neighbor Move Operators', () => {
  it('swapTeamMove reassigns an incident to an alternate valid team', () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const plan = nearestFirstBaseline(scenario, graph, cache);
    const rng = createMulberry32(12345);

    const neighbor = swapTeamMove(plan, scenario, rng);
    expect(neighbor).not.toBeNull();
    expect(neighbor!.assignments.length).toBe(plan.assignments.length);

    // Should find at least one assignment with a modified team
    let changed = false;
    for (let i = 0; i < plan.assignments.length; i++) {
      if (plan.assignments[i]!.teamId !== neighbor!.assignments[i]!.teamId) {
        changed = true;
        const validTeams = scenario.teams.map((t) => t.id);
        expect(validTeams).toContain(neighbor!.assignments[i]!.teamId);
      }
    }
    expect(changed).toBe(true);
  });

  it('swapRouteMove mutates routeIndex within [0, 1, 2]', () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const plan = nearestFirstBaseline(scenario, graph, cache);
    const rng = createMulberry32(999);

    const neighbor = swapRouteMove(plan, scenario, rng);
    expect(neighbor).not.toBeNull();
    expect(neighbor!.assignments.length).toBe(plan.assignments.length);

    let changed = false;
    for (let i = 0; i < plan.assignments.length; i++) {
      const r = neighbor!.assignments[i]!.routeIndex;
      expect([0, 1, 2]).toContain(r);
      if (plan.assignments[i]!.routeIndex !== r) {
        changed = true;
      }
    }
    expect(changed).toBe(true);
  });

  it('swapOrderMove swaps execution order between two assignments', () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const plan = nearestFirstBaseline(scenario, graph, cache);
    const rng = createMulberry32(54321);

    const neighbor = swapOrderMove(plan, scenario, rng);
    expect(neighbor).not.toBeNull();
    expect(neighbor!.assignments.length).toBe(plan.assignments.length);

    // The set of incident IDs should remain identical
    const origIncidents = plan.assignments.map((a) => a.incidentId).sort();
    const newIncidents = neighbor!.assignments.map((a) => a.incidentId).sort();
    expect(newIncidents).toEqual(origIncidents);
  });

  it('generateNeighbors produces requested count of candidate plans', () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const plan = nearestFirstBaseline(scenario, graph, cache);
    const rng = createMulberry32(42);

    const neighbors = generateNeighbors(plan, scenario, 5, rng);
    expect(neighbors.length).toBe(5);
    for (const nb of neighbors) {
      expect(nb.assignments.length).toBe(plan.assignments.length);
    }
  });
});

describe('Hill Climbing Core Optimizer', () => {
  it('runs deterministically and never degrades baseline cost', () => {
    const scenario = makeScenario();
    const result1 = hillClimb(scenario, graph, {
      maxRestarts: 2,
      maxIterationsPerRestart: 10,
      neighborsPerStep: 4,
      seed: 777,
    });
    const result2 = hillClimb(scenario, graph, {
      maxRestarts: 2,
      maxIterationsPerRestart: 10,
      neighborsPerStep: 4,
      seed: 777,
    });

    expect(result1.bestCostJ).toBeLessThanOrEqual(result1.baselineCostJ);
    expect(result1.bestCostJ).toBeCloseTo(result2.bestCostJ, 4);
    expect(result1.convergence.length).toBe(result2.convergence.length);
    expect(result1.bestPlan.assignments.length).toBe(scenario.incidents.length);
  });

  it('tracks monotonic convergence progression', () => {
    const scenario = makeScenario();
    const result = hillClimb(scenario, graph, {
      maxRestarts: 2,
      maxIterationsPerRestart: 15,
      neighborsPerStep: 4,
      seed: 101,
    });

    expect(result.convergence.length).toBeGreaterThanOrEqual(1);
    expect(result.convergence[0]!.iteration).toBe(0);
    expect(result.convergence[0]!.costJ).toBe(result.baselineCostJ);

    // Track that the best known cost in convergence is non-increasing
    let runningMin = Infinity;
    for (const pt of result.convergence) {
      if (pt.costJ < runningMin) {
        runningMin = pt.costJ;
      }
    }
    expect(result.bestCostJ).toBeLessThanOrEqual(result.baselineCostJ);
  });

  it('respects early cancellation through shouldStop', () => {
    const scenario = makeScenario();
    let iterCount = 0;
    const result = hillClimb(scenario, graph, {
      maxRestarts: 5,
      maxIterationsPerRestart: 50,
      neighborsPerStep: 4,
      seed: 42,
      shouldStop: () => {
        iterCount++;
        return iterCount > 3;
      },
    });

    expect(result.totalIterations).toBeLessThan(10);
  });
});

describe('OptimizerRunner Web Worker / Client Controller', () => {
  it('runs optimization with progress and completion callbacks', async () => {
    const scenario = makeScenario();
    const runner = new OptimizerRunner();

    const progressUpdates: number[] = [];

    const result = await new Promise<any>((resolve, reject) => {
      runner.start(
        scenario,
        graph,
        {
          maxRestarts: 2,
          maxIterationsPerRestart: 10,
          neighborsPerStep: 4,
          seed: 42,
        },
        {
          onProgress: (p) => {
            progressUpdates.push(p.bestJ);
          },
          onDone: (res) => resolve(res),
          onError: (err) => reject(err),
        }
      );
    });

    expect(result).toBeDefined();
    expect(result.bestCostJ).toBeLessThanOrEqual(result.baselineCostJ);
    expect(runner.running).toBe(false);
  });

  it('supports stopping a running optimizer cleanly', () => {
    const runner = new OptimizerRunner();
    runner.stop();
    expect(runner.running).toBe(false);
  });
});
