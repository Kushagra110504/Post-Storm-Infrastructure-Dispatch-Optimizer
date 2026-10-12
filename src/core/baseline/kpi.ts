/**
 * KPI Evaluation — derives human-readable KPIs from a SimulationResult.
 */
import { SimulationResult } from "../plan/types";
import { Scenario } from "../model/schema";

export interface KPIs {
  makespanMinutes: number;
  /** Average time from incident report to repair completion */
  avgResolutionTimeMinutes: number;
  /** Number of incidents resolved */
  resolvedCount: number;
  /** Number of incidents unresolved */
  unresolvedCount: number;
  /** Weighted restoration delay (facility criticality × time to restore) */
  weightedRestorationDelay: number;
  /** Cost function J */
  costJ: number;
  /** Facilities fully restored */
  facilitiesRestored: number;
  /** Total facilities in scenario */
  totalFacilities: number;
}

export function computeKPIs(result: SimulationResult, scenario: Scenario): KPIs {
  const resolved = result.incidentResults.filter((r) => isFinite(r.repairEndMinutes));
  const unresolved = result.incidentResults.filter((r) => !isFinite(r.repairEndMinutes));

  const avgResolutionTimeMinutes =
    resolved.length > 0
      ? resolved.reduce((sum, r) => {
          const incident = scenario.incidents.find((i) => i.id === r.incidentId);
          const reportedAt = incident?.reportedAt ?? 0;
          return sum + (r.repairEndMinutes - reportedAt);
        }, 0) / resolved.length
      : 0;

  // Count restored facilities: all incidentIds resolved
  const resolvedIds = new Set(resolved.map((r) => r.incidentId));
  const facilitiesRestored = scenario.facilities.filter((f) =>
    f.incidentIds.every((iid) => resolvedIds.has(iid))
  ).length;

  return {
    makespanMinutes: result.makespanMinutes,
    avgResolutionTimeMinutes,
    resolvedCount: resolved.length,
    unresolvedCount: unresolved.length,
    weightedRestorationDelay: result.weightedRestorationDelay,
    costJ: result.costJ,
    facilitiesRestored,
    totalFacilities: scenario.facilities.length,
  };
}

/** Format KPIs as a short display string. */
export function formatKPIs(kpis: KPIs): string {
  return [
    `Makespan:          ${kpis.makespanMinutes.toFixed(1)} min`,
    `Avg resolution:    ${kpis.avgResolutionTimeMinutes.toFixed(1)} min`,
    `Resolved:          ${kpis.resolvedCount} / ${kpis.resolvedCount + kpis.unresolvedCount} incidents`,
    `Facilities restored: ${kpis.facilitiesRestored} / ${kpis.totalFacilities}`,
    `Wt. restore delay: ${kpis.weightedRestorationDelay.toFixed(1)}`,
    `Cost J:            ${kpis.costJ.toFixed(1)}`,
  ].join("\n");
}
