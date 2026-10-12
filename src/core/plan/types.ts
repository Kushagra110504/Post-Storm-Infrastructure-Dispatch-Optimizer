/**
 * DispatchPlan: maps each incident to an assigned team + chosen route index.
 * TimelineEvent: discrete simulator output event.
 */
import { RouteResult } from "../routing/dijkstra";

/** One assignment: team t dispatched to incident i, using routeIndex from k-alt routes. */
export interface Assignment {
  incidentId: string;
  teamId: string;
  /** Index into kRoutes (0 = fastest). Optimizer may pick alt routes. */
  routeIndex: number;
  /** Resolved at simulation time from kRoutes[routeIndex]. */
  route?: RouteResult;
}

/** Full dispatch plan submitted to the simulator. */
export interface DispatchPlan {
  id: string;
  scenarioId: string;
  assignments: Assignment[];
  /** ISO timestamp when this plan was created. */
  createdAt: string;
}

/** Categories of simulator events. */
export type EventType =
  | "team-dispatched"
  | "team-arrived"
  | "repair-started"
  | "repair-completed"
  | "edge-unblocked"
  | "facility-restored"
  | "dependency-unblocked";

/** A discrete event produced by the timeline simulator. */
export interface TimelineEvent {
  type: EventType;
  timeMinutes: number;
  teamId?: string;
  incidentId?: string;
  facilityId?: string;
  edgeId?: string;
  message: string;
}

/** Aggregated state of one incident after simulation. */
export interface IncidentResult {
  incidentId: string;
  teamId: string | null;
  dispatchTimeMinutes: number;   // when team was sent
  arrivalTimeMinutes: number;    // when team reached site
  repairStartMinutes: number;    // when repair actually began (after dependencies)
  repairEndMinutes: number;      // when repair finished
  waitedForDependency: boolean;
}

/** Full output of a simulator run. */
export interface SimulationResult {
  planId: string;
  events: TimelineEvent[];
  incidentResults: IncidentResult[];
  /** Time (minutes) when the last incident is resolved. */
  makespanMinutes: number;
  /** Sum of weighted restoration delays across all critical facilities. */
  weightedRestorationDelay: number;
  /** Value of the cost function J. */
  costJ: number;
}
