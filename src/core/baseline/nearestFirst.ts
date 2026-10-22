/**
 * Nearest-Team-First Baseline Dispatcher.
 *
 * Algorithm:
 *  1. Sort incidents by priority: severity DESC, then reportedAt ASC.
 *  2. For each incident (in priority order), find the nearest AVAILABLE team
 *     that has the required skill.
 *  3. If no skilled team is available, fall back to the nearest team overall.
 *  4. Once assigned, mark team unavailable until its estimated repair end.
 *
 * This produces a greedy baseline DispatchPlan that Hill Climbing can beat.
 */
import { Scenario, CityGraph } from "../model/schema";
import { RouteCache } from "../routing/routeCache";
import { DispatchPlan, Assignment } from "../plan/types";

export interface BaselineOptions {
  /** Blocked edges at scenario start (road incidents). */
  initialBlockedEdges?: Set<string>;
}

/**
 * Generate a greedy nearest-team-first dispatch plan.
 */
export function nearestFirstBaseline(
  scenario: Scenario,
  graph: CityGraph,
  cache: RouteCache,
  options: BaselineOptions = {}
): DispatchPlan {
  const blockedEdges = options.initialBlockedEdges ?? buildInitialBlockedEdges(scenario);

  // Sort incidents: higher severity first, earlier reported first
  const sortedIncidents = [...scenario.incidents].sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return a.reportedAt - b.reportedAt;
  });

  // Team availability tracking: minutes until team is free
  const teamFreeAt = new Map<string, number>(
    scenario.teams.map((t) => [t.id, t.availableAt])
  );

  // Which incidents have been resolved (for dependency checking)
  const resolvedIncidentIds = new Set<string>();

  const assignments: Assignment[] = [];

  // Process in topological order respecting dependencies
  const remaining = [...sortedIncidents];
  const MAX_PASSES = remaining.length * 3;
  let passes = 0;

  while (remaining.length > 0 && passes++ < MAX_PASSES) {
    let madeProgress = false;

    for (let i = remaining.length - 1; i >= 0; i--) {
      const incident = remaining[i]!;

      // Check dependency
      if (incident.dependsOn && !resolvedIncidentIds.has(incident.dependsOn)) {
        continue; // wait for dependency
      }

      // Find best team: prefer skilled, then nearest
      let bestTeamId: string | null = null;
      let bestTravelTime = Infinity;
      let bestRouteIndex = 0;

      for (const team of scenario.teams) {
        // Skip already-fully-assigned teams only if they're busy with a higher-priority job
        // (teams can be re-used after their previous repair ends)
        const freeAt = teamFreeAt.get(team.id) ?? 0;
        const dispatchTime = Math.max(freeAt, incident.reportedAt);

        const route = cache.getRoute(graph, team.currentNode, incident.node, blockedEdges);
        if (!route) continue;

        const travelMin = route.totalTimeSeconds / 60;
        const arrivalTime = dispatchTime + travelMin;
        const skillMatch = team.skills.includes(incident.requiredSkill) ? 1.0 : 1.5;
        const repairEnd = arrivalTime + incident.baseRepairTime / (team.speedFactor * skillMatch);

        // Score: prefer skilled teams, then minimize repair end time
        const skillBonus = team.skills.includes(incident.requiredSkill) ? 0 : 10000;
        const score = repairEnd + skillBonus;

        if (score < bestTravelTime) {
          bestTravelTime = score;
          bestTeamId = team.id;
          bestRouteIndex = 0;
        }
      }

      if (!bestTeamId) {
        // No team reachable — skip for now (e.g., road incident blocking all paths)
        continue;
      }

      const team = scenario.teams.find((t) => t.id === bestTeamId)!;
      const freeAt = teamFreeAt.get(bestTeamId) ?? 0;
      const dispatchTime = Math.max(freeAt, incident.reportedAt);
      const route = cache.getRoute(graph, team.currentNode, incident.node, blockedEdges) ?? {
        path: [team.currentNode],
        edges: [],
        totalDistance: 0,
        totalTimeSeconds: 9999,
      };
      const travelMin = route.totalTimeSeconds / 60;
      const skillMatch = team.skills.includes(incident.requiredSkill) ? 1.0 : 1.5;
      const repairEnd = dispatchTime + travelMin + incident.baseRepairTime / (team.speedFactor * skillMatch);

      assignments.push({
        incidentId: incident.id,
        teamId: bestTeamId,
        routeIndex: bestRouteIndex,
        route,
      });

      // Update team availability (note: team.currentNode stays at depot for baseline)
      teamFreeAt.set(bestTeamId, repairEnd);
      resolvedIncidentIds.add(incident.id);

      // Unblock road edge if applicable
      if (incident.blockedEdgeId) {
        blockedEdges.delete(incident.blockedEdgeId);
      }

      remaining.splice(i, 1);
      madeProgress = true;
    }

    if (!madeProgress) break;
  }

  return {
    id: `baseline-${Date.now()}`,
    scenarioId: scenario.id,
    assignments,
    createdAt: new Date().toISOString(),
  };
}

/** Extract initially blocked edge IDs from road incidents. */
function buildInitialBlockedEdges(scenario: Scenario): Set<string> {
  return new Set(
    scenario.incidents
      .filter((i) => i.blockedEdgeId)
      .map((i) => i.blockedEdgeId!)
  );
}
