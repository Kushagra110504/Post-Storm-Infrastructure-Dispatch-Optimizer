/**
 * Timeline Simulator — deterministically executes a DispatchPlan against a Scenario.
 *
 * Rules:
 *  - Travel time is derived from the assigned route (or Dijkstra fallback).
 *  - Repair cannot start until all dependsOn incidents are resolved.
 *  - Road incident resolved => that edge is unblocked for subsequent routing.
 *  - baseRepairTime is scaled by 1 / (team.speedFactor * skillMatch).
 *  - Facility restored when ALL its incidentIds are resolved.
 */
import { Scenario } from "../model/schema";
import { CityGraph } from "../model/schema";
import { RouteCache } from "../routing/routeCache";
import {
  DispatchPlan,
  IncidentResult,
  SimulationResult,
  TimelineEvent,
} from "./types";

/** Simulate a plan; returns full timeline and KPIs. */
export function simulate(
  plan: DispatchPlan,
  scenario: Scenario,
  graph: CityGraph,
  cache: RouteCache
): SimulationResult {
  const events: TimelineEvent[] = [];
  const incidentResults: IncidentResult[] = [];

  // --- Mutable state -------------------------------------------------------
  /** When each incident is fully resolved (minutes). Infinity = not yet. */
  const resolvedAt = new Map<string, number>();
  /** Blocked edge IDs (from scenario-loaded incidents). */
  const blockedEdges = new Set<string>(
    scenario.incidents
      .filter((i) => i.blockedEdgeId)
      .map((i) => i.blockedEdgeId!)
  );

  /** When each team becomes available again (minutes from t=0). */
  const teamAvailAt = new Map<string, number>(
    scenario.teams.map((t) => [t.id, t.availableAt])
  );

  // Build incident lookup
  const incidentById = new Map(scenario.incidents.map((i) => [i.id, i]));
  const teamById = new Map(scenario.teams.map((t) => [t.id, t]));

  // Process assignments in order (simulator iterates until all resolved)
  // We use a simple discrete-event approach: events are sorted by time.
  interface PendingAssignment {
    incidentId: string;
    teamId: string;
    routeIndex: number;
    startedAt: number; // when team was dispatched
  }

  const pending: PendingAssignment[] = plan.assignments.map((a) => ({
    incidentId: a.incidentId,
    teamId: a.teamId,
    routeIndex: a.routeIndex,
    startedAt: 0,
  }));

  // Simulation loop — up to 2×|incidents| passes to handle dependency chains
  const MAX_ROUNDS = scenario.incidents.length * 3;
  let round = 0;

  while (pending.length > 0 && round++ < MAX_ROUNDS) {
    let progressed = false;

    for (let idx = pending.length - 1; idx >= 0; idx--) {
      const pa = pending[idx]!;
      const incident = incidentById.get(pa.incidentId);
      if (!incident) { pending.splice(idx, 1); continue; }

      // Check dependency
      if (incident.dependsOn) {
        const depResolvedAt = resolvedAt.get(incident.dependsOn);
        if (depResolvedAt === undefined) continue; // wait
      }

      const team = teamById.get(pa.teamId);
      if (!team) { pending.splice(idx, 1); continue; }

      const dispatchTime = Math.max(
        teamAvailAt.get(pa.teamId) ?? 0,
        incident.reportedAt ?? 0,
        incident.dependsOn ? (resolvedAt.get(incident.dependsOn) ?? 0) : 0
      );

      // Route: single Dijkstra for primary routeIndex 0, k-routes only when an alternative route is requested
      let chosenRoute: import("../routing/dijkstra").RouteResult | null = null;
      if (pa.routeIndex === 0) {
        chosenRoute = cache.getRoute(graph, team.currentNode, incident.node, blockedEdges);
      } else {
        const kResult = cache.getKRoutes(graph, team.currentNode, incident.node, 3, blockedEdges);
        chosenRoute = kResult.routes[pa.routeIndex] ?? kResult.routes[0] ?? null;
      }

      // Attach resolved route to the plan assignment for visualization
      const matchingAssignment = plan.assignments.find(
        (a) => a.incidentId === pa.incidentId && a.teamId === pa.teamId
      );
      if (matchingAssignment && chosenRoute) {
        matchingAssignment.route = chosenRoute;
      }

      const travelMinutes = chosenRoute
        ? chosenRoute.totalTimeSeconds / 60
        : 999; // unreachable fallback

      const arrivalTime = dispatchTime + travelMinutes;

      // Skill match: if team has required skill => 1.0, else 1.5× slower
      const skillMatch = team.skills.includes(incident.requiredSkill) ? 1.0 : 1.5;
      const repairMinutes = incident.baseRepairTime / (team.speedFactor * skillMatch);

      const repairStart = arrivalTime;
      const repairEnd = repairStart + repairMinutes;

      // Emit events
      emit(events, {
        type: "team-dispatched",
        timeMinutes: dispatchTime,
        teamId: pa.teamId,
        incidentId: pa.incidentId,
        message: `${team.name} dispatched to ${incident.placeName}`,
      });
      emit(events, {
        type: "team-arrived",
        timeMinutes: arrivalTime,
        teamId: pa.teamId,
        incidentId: pa.incidentId,
        message: `${team.name} arrived at ${incident.placeName}`,
      });
      emit(events, {
        type: "repair-started",
        timeMinutes: repairStart,
        teamId: pa.teamId,
        incidentId: pa.incidentId,
        message: `Repair started at ${incident.placeName}`,
      });
      emit(events, {
        type: "repair-completed",
        timeMinutes: repairEnd,
        teamId: pa.teamId,
        incidentId: pa.incidentId,
        message: `${incident.placeName} (${incident.type}) resolved`,
      });

      // Unblock edge if this is a road incident
      if (incident.blockedEdgeId) {
        blockedEdges.delete(incident.blockedEdgeId);
        // Note: cache keys are already partitioned by blocked edges, no need to wipe cache
        emit(events, {
          type: "edge-unblocked",
          timeMinutes: repairEnd,
          edgeId: incident.blockedEdgeId,
          incidentId: pa.incidentId,
          message: `Road edge ${incident.blockedEdgeId} cleared`,
        });
      }

      // Check facility restoration
      for (const facility of scenario.facilities) {
        if (facility.incidentIds.includes(pa.incidentId)) {
          const allResolved = facility.incidentIds.every(
            (iid) => iid === pa.incidentId || resolvedAt.has(iid)
          );
          if (allResolved) {
            emit(events, {
              type: "facility-restored",
              timeMinutes: repairEnd,
              facilityId: facility.id,
              incidentId: pa.incidentId,
              message: `${facility.name} fully restored`,
            });
          }
        }
      }

      resolvedAt.set(pa.incidentId, repairEnd);
      teamAvailAt.set(pa.teamId, repairEnd);

      incidentResults.push({
        incidentId: pa.incidentId,
        teamId: pa.teamId,
        dispatchTimeMinutes: dispatchTime,
        arrivalTimeMinutes: arrivalTime,
        repairStartMinutes: repairStart,
        repairEndMinutes: repairEnd,
        waitedForDependency: !!incident.dependsOn,
      });

      pending.splice(idx, 1);
      progressed = true;
    }

    if (!progressed) break; // deadlock guard
  }

  // Incidents stuck in pending (dependency deadlock or no team)
  for (const pa of pending) {
    const incident = incidentById.get(pa.incidentId);
    incidentResults.push({
      incidentId: pa.incidentId,
      teamId: pa.teamId,
      dispatchTimeMinutes: Infinity,
      arrivalTimeMinutes: Infinity,
      repairStartMinutes: Infinity,
      repairEndMinutes: Infinity,
      waitedForDependency: !!incident?.dependsOn,
    });
  }

  // Incidents with no assignment at all
  const assignedIds = new Set(plan.assignments.map((a) => a.incidentId));
  for (const incident of scenario.incidents) {
    if (!assignedIds.has(incident.id) && !resolvedAt.has(incident.id)) {
      incidentResults.push({
        incidentId: incident.id,
        teamId: null,
        dispatchTimeMinutes: Infinity,
        arrivalTimeMinutes: Infinity,
        repairStartMinutes: Infinity,
        repairEndMinutes: Infinity,
        waitedForDependency: !!incident.dependsOn,
      });
    }
  }


  events.sort((a, b) => a.timeMinutes - b.timeMinutes);

  const makespanMinutes = incidentResults.reduce(
    (max, r) => (isFinite(r.repairEndMinutes) ? Math.max(max, r.repairEndMinutes) : max),
    0
  );

  // Weighted restoration delay
  let weightedRestorationDelay = 0;
  for (const facility of scenario.facilities) {
    const lastResolved = facility.incidentIds.reduce((max, iid) => {
      const t = resolvedAt.get(iid);
      return t !== undefined && isFinite(t) ? Math.max(max, t) : max;
    }, 0);
    weightedRestorationDelay += facility.criticalityWeight * lastResolved;
  }

  return {
    planId: plan.id,
    events,
    incidentResults,
    makespanMinutes,
    weightedRestorationDelay,
    costJ: 0, // filled by costFunction
  };
}

function emit(events: TimelineEvent[], e: TimelineEvent): void {
  events.push(e);
}
