import { Scenario, CityGraph } from '../model/schema';
import { DispatchPlan, Assignment, SimulationResult } from '../plan/types';
import { simulate } from '../plan/simulator';
import { evaluateCost, DEFAULT_WEIGHTS } from '../cost/costFunction';
import { RouteCache } from '../routing/routeCache';
import {
  hillClimb,
  HillClimbOptions,
  DEFAULT_HC_OPTIONS,
} from '../hillclimb/hillClimb';
import { explainPlanDiff, PlanDiffExplanation } from '../explain/explainer';

export interface ReplanResult {
  newPlan: DispatchPlan;
  newSimResult: SimulationResult;
  newCostJ: number;
  explanation: PlanDiffExplanation;
}

/**
 * Perform warm-start dynamic replanning mid-operation when a disruption occurs.
 *
 * Algorithm:
 *  1. Identifies completed and in-progress assignments at currentTimeMinutes.
 *  2. Locks finished assignments so historical work is preserved.
 *  3. Injects unstarted and newly added incidents into the planning pool.
 *  4. Performs warm-start Hill Climbing optimizing the active and pending tasks.
 *  5. Re-evaluates cost J and computes an explainability diff.
 */
export function dynamicReplan(
  scenario: Scenario,
  graph: CityGraph,
  currentPlan: DispatchPlan,
  previousSimResult: SimulationResult,
  currentTimeMinutes: number,
  disruptionDescription: string,
  options: Partial<HillClimbOptions> = {}
): ReplanResult {
  const cache = new RouteCache(graph);

  // 1. Determine completed incidents from simulation timeline
  const completedIncidentIds = new Set<string>();
  for (const event of previousSimResult.events) {
    if (event.type === 'repair-completed' && event.timeMinutes <= currentTimeMinutes && event.incidentId) {
      completedIncidentIds.add(event.incidentId);
    }
  }

  // 2. Identify all incident IDs that must be planned in the new scenario
  const allScenarioIncidentIds = new Set(scenario.incidents.map((i) => i.id));
  const existingPlannedIncidentIds = new Set(currentPlan.assignments.map((a) => a.incidentId));

  // 3. Assemble warm-start baseline plan
  const warmAssignments: Assignment[] = [];

  // Carry over completed assignments verbatim
  for (const a of currentPlan.assignments) {
    if (completedIncidentIds.has(a.incidentId)) {
      warmAssignments.push({ ...a });
    }
  }

  // Carry over uncompleted assignments from currentPlan if still in scenario
  for (const a of currentPlan.assignments) {
    if (!completedIncidentIds.has(a.incidentId) && allScenarioIncidentIds.has(a.incidentId)) {
      warmAssignments.push({ ...a });
    }
  }

  // Add any newly injected incidents that were not in currentPlan
  const unassignedNewIncidents = scenario.incidents.filter(
    (i) => !existingPlannedIncidentIds.has(i.id)
  );

  if (unassignedNewIncidents.length > 0) {
    const teams = scenario.teams;
    for (let i = 0; i < unassignedNewIncidents.length; i++) {
      const inc = unassignedNewIncidents[i]!;
      // Find team with matching skill, or closest team
      const matchedTeam =
        teams.find((t) => t.skills.includes(inc.requiredSkill)) ??
        teams[i % teams.length]!;

      warmAssignments.push({
        teamId: matchedTeam.id,
        incidentId: inc.id,
        routeIndex: 0,
      });
    }
  }

  const warmStartPlan: DispatchPlan = {
    id: `replan-warm-${Date.now()}`,
    scenarioId: scenario.id,
    createdAt: new Date().toISOString(),
    assignments: warmAssignments,
  };

  // 4. Run warm-start Hill Climbing
  const hcOpts: Partial<HillClimbOptions> = {
    ...DEFAULT_HC_OPTIONS,
    maxRestarts: 2,
    maxIterationsPerRestart: 30,
    neighborsPerStep: 6,
    seed: scenario.seed + 100,
    initialPlan: warmStartPlan,
    lockedIncidentIds: completedIncidentIds,
    ...options,
  };

  // Optimize with Hill Climbing
  const hcResult = hillClimb(scenario, graph, hcOpts);

  // Compare warm-start plan simulation vs HC result to choose the strictly better plan
  const warmSim = simulate(warmStartPlan, scenario, graph, cache);
  const warmJ = evaluateCost(warmSim, scenario, DEFAULT_WEIGHTS);

  let chosenPlan: DispatchPlan;
  let chosenSim: SimulationResult;
  let chosenJ: number;

  if (hcResult.bestCostJ < warmJ) {
    chosenPlan = hcResult.bestPlan;
    chosenSim = hcResult.bestSimResult;
    chosenJ = hcResult.bestCostJ;
  } else {
    chosenPlan = warmStartPlan;
    chosenSim = warmSim;
    chosenJ = warmJ;
  }

  // 5. Generate human-readable plan diff and explanation
  const explanation = explainPlanDiff(
    currentPlan,
    chosenPlan,
    previousSimResult,
    chosenSim,
    scenario,
    disruptionDescription
  );

  return {
    newPlan: chosenPlan,
    newSimResult: chosenSim,
    newCostJ: chosenJ,
    explanation,
  };
}
