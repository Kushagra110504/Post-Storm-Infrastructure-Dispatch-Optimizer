/**
 * Cost Function J — the objective minimized by Hill Climbing.
 *
 * J = alpha * makespanMinutes
 *   + beta  * weightedRestorationDelay
 *   + gamma * penaltyUnreachable
 *
 * Lower is better.
 *
 * Weights:
 *   alpha = 1.0  (makespan: minimize total operation time)
 *   beta  = 2.0  (weighted restoration delay: heavier penalty for critical facilities)
 *   gamma = 500  (large constant per unresolved incident — infeasibility deterrent)
 */
import { SimulationResult } from "../plan/types";
import { Scenario } from "../model/schema";

export interface CostWeights {
  alpha: number;  // makespan coefficient
  beta: number;   // weighted restoration delay coefficient
  gamma: number;  // per-unresolved-incident penalty
}

export const DEFAULT_WEIGHTS: CostWeights = {
  alpha: 1.0,
  beta: 2.0,
  gamma: 500,
};

/**
 * Evaluate J given the simulation output.
 * Mutates result.costJ in place and also returns it.
 */
export function evaluateCost(
  result: SimulationResult,
  _scenario: Scenario,
  weights: CostWeights = DEFAULT_WEIGHTS
): number {
  const unresolvedCount = result.incidentResults.filter(
    (r) => !isFinite(r.repairEndMinutes)
  ).length;

  const J =
    weights.alpha * result.makespanMinutes +
    weights.beta * result.weightedRestorationDelay +
    weights.gamma * unresolvedCount;

  result.costJ = J;
  return J;
}

/**
 * Compares two plans by cost J — useful for Hill Climbing neighbor selection.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareCost(a: SimulationResult, b: SimulationResult): number {
  return a.costJ - b.costJ;
}

/**
 * Returns a human-readable breakdown of cost J components.
 */
export function costBreakdown(
  result: SimulationResult,
  weights: CostWeights = DEFAULT_WEIGHTS
): string {
  const unresolvedCount = result.incidentResults.filter(
    (r) => !isFinite(r.repairEndMinutes)
  ).length;

  return [
    `J = ${result.costJ.toFixed(1)}`,
    `  makespan:   ${weights.alpha} × ${result.makespanMinutes.toFixed(1)} min = ${(weights.alpha * result.makespanMinutes).toFixed(1)}`,
    `  wt.restore: ${weights.beta} × ${result.weightedRestorationDelay.toFixed(1)} = ${(weights.beta * result.weightedRestorationDelay).toFixed(1)}`,
    `  unresolved: ${weights.gamma} × ${unresolvedCount} = ${(weights.gamma * unresolvedCount).toFixed(1)}`,
  ].join("\n");
}
