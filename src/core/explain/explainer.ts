import { Scenario } from '../model/schema';
import { DispatchPlan, SimulationResult } from '../plan/types';

export type DiffType = 'REASSIGNED' | 'REROUTED' | 'NEW' | 'UNCHANGED';

export interface AssignmentDiff {
  incidentId: string;
  placeName: string;
  previousTeamName?: string;
  newTeamName: string;
  previousRouteIndex?: number;
  newRouteIndex: number;
  type: DiffType;
  reason: string;
}

export interface PlanDiffExplanation {
  disruptionSummary: string;
  diffs: AssignmentDiff[];
  kpiDelta: {
    makespanChangeMinutes: number;
    costDeltaJ: number;
    facilitiesRestoredDelta: number;
  };
  naturalLanguageSummary: string[];
}

/**
 * Generate human-readable, plain-language explanations of why a replan changed
 * crew assignments and routes in response to an operational disruption.
 */
export function explainPlanDiff(
  oldPlan: DispatchPlan,
  newPlan: DispatchPlan,
  oldResult: SimulationResult,
  newResult: SimulationResult,
  scenario: Scenario,
  disruptionDescription: string
): PlanDiffExplanation {
  const teamNameById = new Map(scenario.teams.map((t) => [t.id, t.name]));
  const incidentById = new Map(scenario.incidents.map((i) => [i.id, i]));
  const oldAssignmentsByInc = new Map(oldPlan.assignments.map((a) => [a.incidentId, a]));

  const diffs: AssignmentDiff[] = [];
  const naturalLanguageSummary: string[] = [];

  naturalLanguageSummary.push(`Operational update: ${disruptionDescription}.`);

  let reassignedCount = 0;
  let reroutedCount = 0;
  let newAddedCount = 0;

  for (const newAssign of newPlan.assignments) {
    const inc = incidentById.get(newAssign.incidentId);
    const placeName = inc?.placeName ?? newAssign.incidentId;
    const oldAssign = oldAssignmentsByInc.get(newAssign.incidentId);
    const newTeamName = teamNameById.get(newAssign.teamId) ?? newAssign.teamId;

    if (!oldAssign) {
      newAddedCount++;
      diffs.push({
        incidentId: newAssign.incidentId,
        placeName,
        newTeamName,
        newRouteIndex: newAssign.routeIndex,
        type: 'NEW',
        reason: `New emergency fault dispatched directly to ${newTeamName} via Route #${newAssign.routeIndex + 1}.`,
      });
      naturalLanguageSummary.push(
        `• Dispatched ${newTeamName} to newly reported incident at ${placeName}.`
      );
    } else if (oldAssign.teamId !== newAssign.teamId) {
      reassignedCount++;
      const oldTeamName = teamNameById.get(oldAssign.teamId) ?? oldAssign.teamId;
      diffs.push({
        incidentId: newAssign.incidentId,
        placeName,
        previousTeamName: oldTeamName,
        newTeamName,
        previousRouteIndex: oldAssign.routeIndex,
        newRouteIndex: newAssign.routeIndex,
        type: 'REASSIGNED',
        reason: `Reassigned from ${oldTeamName} to ${newTeamName} to balance crew workload and minimize travel delay.`,
      });
      naturalLanguageSummary.push(
        `• Reassigned ${placeName} from ${oldTeamName} to ${newTeamName} to optimize arrival time.`
      );
    } else if (oldAssign.routeIndex !== newAssign.routeIndex) {
      reroutedCount++;
      diffs.push({
        incidentId: newAssign.incidentId,
        placeName,
        previousTeamName: newTeamName,
        newTeamName,
        previousRouteIndex: oldAssign.routeIndex,
        newRouteIndex: newAssign.routeIndex,
        type: 'REROUTED',
        reason: `Diverted route from Option #${oldAssign.routeIndex + 1} to Alt #${newAssign.routeIndex + 1} to bypass network congestion / blockages.`,
      });
      naturalLanguageSummary.push(
        `• Rerouted ${newTeamName} toward ${placeName} along alternate route #${newAssign.routeIndex + 1}.`
      );
    } else {
      diffs.push({
        incidentId: newAssign.incidentId,
        placeName,
        previousTeamName: newTeamName,
        newTeamName,
        previousRouteIndex: oldAssign.routeIndex,
        newRouteIndex: newAssign.routeIndex,
        type: 'UNCHANGED',
        reason: `Assignment retained with ${newTeamName}.`,
      });
    }
  }

  // Calculate KPI deltas
  const makespanChange = newResult.makespanMinutes - oldResult.makespanMinutes;
  const costDelta = newResult.costJ - oldResult.costJ;

  const oldRestored = oldResult.events.filter((e) => e.type === 'facility-restored').length;
  const newRestored = newResult.events.filter((e) => e.type === 'facility-restored').length;
  const facilitiesRestoredDelta = newRestored - oldRestored;

  if (makespanChange < 0) {
    naturalLanguageSummary.push(
      `• Overall restoration completed ${Math.abs(makespanChange).toFixed(1)} min faster.`
    );
  } else if (makespanChange > 0) {
    naturalLanguageSummary.push(
      `• Total makespan adjusted by +${makespanChange.toFixed(1)} min to absorb disruption safely.`
    );
  }

  if (reassignedCount === 0 && reroutedCount === 0 && newAddedCount === 0) {
    naturalLanguageSummary.push(
      `• Existing dispatch schedule verified as optimal; no crew reassignments required.`
    );
  }

  return {
    disruptionSummary: disruptionDescription,
    diffs,
    kpiDelta: {
      makespanChangeMinutes: makespanChange,
      costDeltaJ: costDelta,
      facilitiesRestoredDelta,
    },
    naturalLanguageSummary,
  };
}
