/**
 * GridRescue: Automated Benchmark Suite
 * Measures routing performance, simulation throughput, and Hill Climbing convergence.
 */
import miniCity from '../tests/fixtures/mini-city.json';
import { CityGraphSchema, Scenario } from '../src/core/model/schema';
import { RouteCache } from '../src/core/routing/routeCache';
import { nearestFirstBaseline } from '../src/core/baseline/nearestFirst';
import { simulate } from '../src/core/plan/simulator';
import { evaluateCost } from '../src/core/cost/costFunction';
import { hillClimb } from '../src/core/hillclimb/hillClimb';

function runBenchmark() {
  console.log('====================================================');
  console.log('       GridRescue Engine Performance Benchmark      ');
  console.log('====================================================');

  const graph = CityGraphSchema.parse(miniCity);
  const nodeIds = Object.keys(graph.nodes);
  console.log(`Loaded test graph with ${nodeIds.length} nodes and ${graph.edges.length} edges.`);

  const scenario: Scenario = {
    id: 'cli-benchmark',
    name: 'CLI Benchmark Scenario',
    cityName: 'Jaipur',
    cityVersionHash: 'hash-bench',
    seed: 42,
    createdAt: new Date().toISOString(),
    operationalNotice: 'CLI Bench',
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

  // 1. Benchmark Routing & Baseline Dispatcher
  const t0 = performance.now();
  const cache = new RouteCache(graph);
  const baselinePlan = nearestFirstBaseline(scenario, graph, cache);
  const sim = simulate(baselinePlan, scenario, graph, new RouteCache(graph));
  const baseJ = evaluateCost(sim, scenario);
  const baselineElapsed = performance.now() - t0;

  console.log(`\n[Baseline Dispatcher]`);
  console.log(`- Time: ${baselineElapsed.toFixed(2)} ms`);
  console.log(`- Initial Cost J: ${baseJ.toFixed(2)}`);
  console.log(`- Makespan: ${sim.makespanMinutes.toFixed(1)} min`);

  // 2. Benchmark Hill Climbing Optimizer
  const t1 = performance.now();
  const hcResult = hillClimb(scenario, graph, {
    maxRestarts: 3,
    maxIterationsPerRestart: 30,
    neighborsPerStep: 6,
    seed: 42,
  });
  const hcElapsed = performance.now() - t1;

  console.log(`\n[Hill Climbing Optimizer]`);
  console.log(`- Total Time: ${hcElapsed.toFixed(2)} ms`);
  console.log(`- Total Iterations: ${hcResult.totalIterations}`);
  console.log(`- Throughput: ${(hcResult.totalIterations / (hcElapsed / 1000)).toFixed(1)} iter/sec`);
  console.log(`- Baseline Cost J: ${hcResult.baselineCostJ.toFixed(2)}`);
  console.log(`- Optimized Cost J: ${hcResult.bestCostJ.toFixed(2)}`);
  console.log(`- Improvement: ${hcResult.improvementPct.toFixed(2)}%`);
  console.log('====================================================\n');
}

runBenchmark();
