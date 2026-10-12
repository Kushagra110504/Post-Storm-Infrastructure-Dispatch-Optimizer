/**
 * Phase 7 Tests: Dynamic Replanning & Explainability Engine
 */
import { describe, it, expect, beforeAll } from 'vitest';
import miniCity from './fixtures/mini-city.json';
import { CityGraph, CityGraphSchema, Scenario, Incident } from '../src/core/model/schema';
import { RouteCache } from '../src/core/routing/routeCache';
import { nearestFirstBaseline } from '../src/core/baseline/nearestFirst';
import { simulate } from '../src/core/plan/simulator';
import { dynamicReplan } from '../src/core/replan/replanner';
import { explainPlanDiff } from '../src/core/explain/explainer';

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
    id: 'replan-test-scenario',
    name: 'Dynamic Replan Test Scenario',
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
        placeName: 'Hospital Transformer Station',
        severity: 5,
        requiredSkill: 'high-voltage',
        requiredEquipment: 'generator',
        baseRepairTime: 20,
        affectedFacilityIds: ['F1'],
        reportedAt: 0,
      },
      {
        id: 'I2',
        type: 'water',
        node: n2,
        placeName: 'Civic Water Pipeline Break',
        severity: 3,
        requiredSkill: 'pipe-repair',
        requiredEquipment: 'excavator',
        baseRepairTime: 30,
        affectedFacilityIds: ['F2'],
        reportedAt: 5,
      },
    ],
    teams: [
      {
        id: 'T1',
        name: 'Alpha Response',
        depotNode: n0,
        currentNode: n0,
        skills: ['high-voltage'],
        vehicleType: 'bucket-truck',
        equipment: ['generator'],
        speedFactor: 1.0,
        availableAt: 0,
        status: 'idle',
      },
      {
        id: 'T2',
        name: 'Beta Utility',
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
        name: 'Memorial Hospital',
        type: 'hospital',
        node: n1,
        criticalityWeight: 3.0,
        incidentIds: ['I1'],
      },
      {
        id: 'F2',
        name: 'Water Reservoirs',
        type: 'water_facility',
        node: n2,
        criticalityWeight: 2.0,
        incidentIds: ['I2'],
      },
    ],
  };
}

describe('Explainability Engine (explainPlanDiff)', () => {
  it('generates narrative and categorizes newly injected incidents', () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const oldPlan = nearestFirstBaseline(scenario, graph, cache);
    const oldSim = simulate(oldPlan, scenario, graph, cache);

    // Create a new incident and updated plan
    const newIncident: Incident = {
      id: 'I3-EMERGENCY',
      type: 'power',
      node: Object.keys(graph.nodes)[0]!,
      placeName: 'Emergency Generator Failure',
      severity: 5,
      requiredSkill: 'high-voltage',
      requiredEquipment: 'generator',
      baseRepairTime: 15,
      affectedFacilityIds: [],
      reportedAt: 10,
    };

    const updatedScenario: Scenario = {
      ...scenario,
      incidents: [...scenario.incidents, newIncident],
    };

    const newPlan = {
      ...oldPlan,
      assignments: [
        ...oldPlan.assignments,
        { teamId: 'T1', incidentId: 'I3-EMERGENCY', routeIndex: 0 },
      ],
    };
    const newSim = simulate(newPlan, updatedScenario, graph, new RouteCache(graph));

    const explanation = explainPlanDiff(
      oldPlan,
      newPlan,
      oldSim,
      newSim,
      updatedScenario,
      'Emergency power failure injected'
    );

    expect(explanation.disruptionSummary).toBe('Emergency power failure injected');
    expect(explanation.naturalLanguageSummary.length).toBeGreaterThanOrEqual(2);
    expect(explanation.diffs.some((d) => d.type === 'NEW')).toBe(true);
  });

  it('detects reassigned teams and rerouted paths with appropriate diff types', () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const oldPlan = nearestFirstBaseline(scenario, graph, cache);
    const oldSim = simulate(oldPlan, scenario, graph, cache);

    // Modifying plan: reassign I1 to T2, and change routeIndex of I2 to 1
    const newPlan = {
      ...oldPlan,
      assignments: oldPlan.assignments.map((a) => {
        if (a.incidentId === 'I1') return { ...a, teamId: 'T2' };
        if (a.incidentId === 'I2') return { ...a, routeIndex: 1 };
        return a;
      }),
    };
    const newSim = simulate(newPlan, scenario, graph, new RouteCache(graph));

    const explanation = explainPlanDiff(
      oldPlan,
      newPlan,
      oldSim,
      newSim,
      scenario,
      'Operational schedule reconfiguration'
    );

    const reassignDiff = explanation.diffs.find((d) => d.incidentId === 'I1');
    const rerouteDiff = explanation.diffs.find((d) => d.incidentId === 'I2');

    expect(reassignDiff?.type).toBe('REASSIGNED');
    expect(rerouteDiff?.type).toBe('REROUTED');
    expect(reassignDiff?.previousTeamName).toBe('Alpha Response');
    expect(reassignDiff?.newTeamName).toBe('Beta Utility');
  });
});

describe('Dynamic Replanning (dynamicReplan)', () => {
  it('executes warm-start replanning upon emergency fault injection', () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const basePlan = nearestFirstBaseline(scenario, graph, cache);
    const baseSim = simulate(basePlan, scenario, graph, cache);

    // Inject emergency incident
    const newIncident: Incident = {
      id: 'I_NEW_HOSPITAL_SURGE',
      type: 'power',
      node: Object.keys(graph.nodes)[0]!,
      placeName: 'Hospital Transformer Surge',
      severity: 5,
      requiredSkill: 'high-voltage',
      requiredEquipment: 'generator',
      baseRepairTime: 12,
      affectedFacilityIds: ['F1'],
      reportedAt: 8,
    };

    const disruptedScenario: Scenario = {
      ...scenario,
      incidents: [...scenario.incidents, newIncident],
    };

    const replanResult = dynamicReplan(
      disruptedScenario,
      graph,
      basePlan,
      baseSim,
      8, // Disruption occurs at t=8m
      'Hospital Transformer Surge reported at t=8m'
    );

    expect(replanResult).toBeDefined();
    expect(replanResult.newPlan.assignments.length).toBe(disruptedScenario.incidents.length);
    expect(replanResult.explanation.diffs.some((d) => d.incidentId === 'I_NEW_HOSPITAL_SURGE')).toBe(
      true
    );
    expect(isFinite(replanResult.newCostJ)).toBe(true);
  });

  it('locks completed assignments that finished before currentTimeMinutes', () => {
    const scenario = makeScenario();
    const cache = new RouteCache(graph);
    const basePlan = nearestFirstBaseline(scenario, graph, cache);
    const baseSim = simulate(basePlan, scenario, graph, cache);

    // Let currentTimeMinutes be past the first incident completion
    const firstCompleted = baseSim.events.find((e) => e.type === 'repair-completed');
    const cutTime = (firstCompleted?.timeMinutes ?? 10) + 1;

    const replanResult = dynamicReplan(
      scenario,
      graph,
      basePlan,
      baseSim,
      cutTime,
      'Routine mid-operation check'
    );

    if (firstCompleted?.incidentId) {
      const origAssign = basePlan.assignments.find((a) => a.incidentId === firstCompleted.incidentId);
      const newAssign = replanResult.newPlan.assignments.find(
        (a) => a.incidentId === firstCompleted.incidentId
      );
      expect(newAssign?.teamId).toBe(origAssign?.teamId);
    }
  });
});
