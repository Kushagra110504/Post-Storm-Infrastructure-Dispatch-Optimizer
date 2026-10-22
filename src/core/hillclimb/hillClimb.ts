/**
 * Hill Climbing with Random Restarts — the core optimizer of GridRescue.
 *
 * Algorithm:
 *  1. Initialize from the baseline plan (or a warm-start plan on replan).
 *  2. Generate neighbors via 3 move types: swap-team, swap-route, swap-order.
 *  3. Support lockedIncidentIds to preserve historical/completed tasks during replanning.
 *  4. Accept any neighbor that strictly improves J (steepest descent / greedy improvement HC).
 *  5. If stuck at a local optimum, perform a random restart.
 *  6. Return the best plan seen across all restarts with convergence history.
 *
 * The algorithm is parameterized, seedable, and deterministic.
 */
import { Scenario, CityGraph } from "../model/schema";
import { DispatchPlan, Assignment, SimulationResult } from "../plan/types";
import { simulate } from "../plan/simulator";
import { evaluateCost, CostWeights, DEFAULT_WEIGHTS } from "../cost/costFunction";
import { RouteCache } from "../routing/routeCache";
import { nearestFirstBaseline } from "../baseline/nearestFirst";
import { createMulberry32 } from "../rng/mulberry32";

export interface HillClimbOptions {
  /** Maximum restarts (each restart = new starting plan). */
  maxRestarts: number;
  /** Maximum iterations per restart before declaring local optimum. */
  maxIterationsPerRestart: number;
  /** Number of neighbors to evaluate per iteration (best-of-N). */
  neighborsPerStep: number;
  /** Seed for reproducible restarts. */
  seed: number;
  /** Cost weights. */
  weights?: CostWeights;
  /** Callback called on progress or improvements. */
  onProgress?: (progress: HillClimbProgress) => void;
  /** Optional cancellation token callback. */
  shouldStop?: () => boolean;
  /** Incident IDs that cannot be mutated (e.g. already completed during mid-op replanning). */
  lockedIncidentIds?: Set<string>;
  /** Initial starting plan for warm start. If provided, restart 0 starts from this plan instead of nearest-first baseline. */
  initialPlan?: DispatchPlan;
}

export const DEFAULT_HC_OPTIONS: HillClimbOptions = {
  maxRestarts: 3,
  maxIterationsPerRestart: 50,
  neighborsPerStep: 6,
  seed: 42,
};

export interface ConvergencePoint {
  iteration: number;
  restart: number;
  costJ: number;
}

export interface HillClimbProgress {
  iteration: number;
  restart: number;
  totalIterations: number;
  currentJ: number;
  bestJ: number;
  bestPlan: DispatchPlan;
  bestSimResult: SimulationResult;
  convergence: ConvergencePoint[];
  improvementPct: number;
}

export interface HillClimbResult {
  bestPlan: DispatchPlan;
  bestSimResult: SimulationResult;
  baselineCostJ: number;
  bestCostJ: number;
  convergence: ConvergencePoint[];
  totalIterations: number;
  improvementPct: number;
}

type RNG = () => number;

/**
 * Run Hill Climbing with random restarts.
 * Pure TypeScript — safe to call from Web Worker or main thread.
 */
export function hillClimb(
  scenario: Scenario,
  graph: CityGraph,
  options: Partial<HillClimbOptions> = {}
): HillClimbResult {
  const mergedOpts: HillClimbOptions = {
    ...DEFAULT_HC_OPTIONS,
    ...options,
  };
  const weights = mergedOpts.weights ?? DEFAULT_WEIGHTS;
  const rng = createMulberry32(mergedOpts.seed);
  const locked = mergedOpts.lockedIncidentIds;

  // --- 1. Evaluate baseline or warm-start plan ---
  // Reuse a shared RouteCache across the entire hill climb run.
  // The graph does not mutate, and RouteCache keys on (start, target, blockedEdges).
  // This avoids rebuilding graph adjacency lists and re-running Yen's k-shortest paths thousands of times.
  const sharedCache = new RouteCache(graph);
  const basePlan = mergedOpts.initialPlan
    ? clonePlan(mergedOpts.initialPlan)
    : nearestFirstBaseline(scenario, graph, sharedCache);
  const baseSimResult = simulate(basePlan, scenario, graph, sharedCache);
  const baselineJ = evaluateCost(baseSimResult, scenario, weights);

  let globalBestPlan = clonePlan(basePlan);
  let globalBestResult = baseSimResult;
  let globalBestJ = baselineJ;

  const convergence: ConvergencePoint[] = [{ iteration: 0, restart: 0, costJ: baselineJ }];
  let totalIterations = 0;

  for (let restart = 0; restart < mergedOpts.maxRestarts; restart++) {
    if (mergedOpts.shouldStop?.()) break;

    // Restart: begin from baseline on restart 0, or a randomized plan on subsequent restarts
    let currentPlan =
      restart === 0
        ? clonePlan(basePlan)
        : randomizePlan(basePlan, scenario, rng, locked);

    let currentResult = simulate(currentPlan, scenario, graph, sharedCache);
    let currentJ = evaluateCost(currentResult, scenario, weights);

    if (currentJ < globalBestJ) {
      globalBestJ = currentJ;
      globalBestPlan = clonePlan(currentPlan);
      globalBestResult = currentResult;
    }

    let stuckCount = 0;

    for (let iter = 0; iter < mergedOpts.maxIterationsPerRestart; iter++) {
      if (mergedOpts.shouldStop?.()) break;
      totalIterations++;

      // Generate neighbors respecting locked tasks
      const neighbors = generateNeighbors(currentPlan, scenario, mergedOpts.neighborsPerStep, rng, locked);

      let bestNeighborPlan: DispatchPlan | null = null;
      let bestNeighborResult: SimulationResult | null = null;
      let bestNeighborJ = currentJ;

      for (const neighborPlan of neighbors) {
        const neighborResult = simulate(neighborPlan, scenario, graph, sharedCache);
        const neighborJ = evaluateCost(neighborResult, scenario, weights);

        if (neighborJ < bestNeighborJ) {
          bestNeighborJ = neighborJ;
          bestNeighborPlan = neighborPlan;
          bestNeighborResult = neighborResult;
        }
      }

      if (bestNeighborPlan && bestNeighborResult && bestNeighborJ < currentJ) {
        currentPlan = bestNeighborPlan;
        currentResult = bestNeighborResult;
        currentJ = bestNeighborJ;
        stuckCount = 0;

        convergence.push({ iteration: totalIterations, restart, costJ: currentJ });

        if (currentJ < globalBestJ) {
          globalBestJ = currentJ;
          globalBestPlan = clonePlan(currentPlan);
          globalBestResult = currentResult;
        }

        mergedOpts.onProgress?.({
          iteration: iter + 1,
          restart,
          totalIterations,
          currentJ,
          bestJ: globalBestJ,
          bestPlan: globalBestPlan,
          bestSimResult: globalBestResult,
          convergence: [...convergence],
          improvementPct: baselineJ > 0 ? ((baselineJ - globalBestJ) / baselineJ) * 100 : 0,
        });
      } else {
        stuckCount++;
        if (stuckCount >= 5) {
          // Local optimum reached for this restart trajectory
          break;
        }
      }
    }
  }

  const improvementPct = baselineJ > 0 ? ((baselineJ - globalBestJ) / baselineJ) * 100 : 0;

  return {
    bestPlan: globalBestPlan,
    bestSimResult: globalBestResult,
    baselineCostJ: baselineJ,
    bestCostJ: globalBestJ,
    convergence,
    totalIterations,
    improvementPct,
  };
}

// ─── Neighbor Generators ──────────────────────────────────────────────────────

export function generateNeighbors(
  plan: DispatchPlan,
  scenario: Scenario,
  count: number,
  rng: RNG,
  lockedIncidentIds?: Set<string>
): DispatchPlan[] {
  const neighbors: DispatchPlan[] = [];
  const moves: Array<(p: DispatchPlan, s: Scenario, r: RNG, locked?: Set<string>) => DispatchPlan | null> = [
    swapTeamMove,
    swapRouteMove,
    swapOrderMove,
  ];

  for (let i = 0; i < count; i++) {
    const move = moves[Math.floor(rng() * moves.length)]!;
    const neighbor = move(plan, scenario, rng, lockedIncidentIds);
    if (neighbor) {
      neighbors.push(neighbor);
    }
  }

  return neighbors;
}

/** Move 1: Reassign one incident to a different team in the scenario. */
export function swapTeamMove(
  plan: DispatchPlan,
  scenario: Scenario,
  rng: RNG,
  lockedIncidentIds?: Set<string>
): DispatchPlan | null {
  const eligibleIndices: number[] = [];
  for (let idx = 0; idx < plan.assignments.length; idx++) {
    if (!lockedIncidentIds?.has(plan.assignments[idx]!.incidentId)) {
      eligibleIndices.push(idx);
    }
  }
  if (eligibleIndices.length === 0 || scenario.teams.length < 2) return null;

  const newAssignments = plan.assignments.map((a) => ({ ...a }));
  const idx = eligibleIndices[Math.floor(rng() * eligibleIndices.length)]!;
  const assignment = newAssignments[idx]!;

  const otherTeams = scenario.teams.filter((t) => t.id !== assignment.teamId);
  if (otherTeams.length === 0) return null;

  const chosenTeam = otherTeams[Math.floor(rng() * otherTeams.length)]!;
  newAssignments[idx] = { ...assignment, teamId: chosenTeam.id, routeIndex: 0 };

  return {
    ...plan,
    id: `hc-swapteam-${Date.now()}-${Math.floor(rng() * 10000)}`,
    assignments: newAssignments,
  };
}

/** Move 2: Pick an alternative k-route (routeIndex 0, 1, or 2) for an assignment. */
export function swapRouteMove(
  plan: DispatchPlan,
  _scenario: Scenario,
  rng: RNG,
  lockedIncidentIds?: Set<string>
): DispatchPlan | null {
  const eligibleIndices: number[] = [];
  for (let idx = 0; idx < plan.assignments.length; idx++) {
    if (!lockedIncidentIds?.has(plan.assignments[idx]!.incidentId)) {
      eligibleIndices.push(idx);
    }
  }
  if (eligibleIndices.length === 0) return null;

  const newAssignments = plan.assignments.map((a) => ({ ...a }));
  const idx = eligibleIndices[Math.floor(rng() * eligibleIndices.length)]!;
  const assignment = newAssignments[idx]!;

  const candidateIndices = [0, 1, 2].filter((r) => r !== assignment.routeIndex);
  const newRouteIndex = candidateIndices[Math.floor(rng() * candidateIndices.length)] ?? 0;
  newAssignments[idx] = { ...assignment, routeIndex: newRouteIndex };

  return {
    ...plan,
    id: `hc-swaproute-${Date.now()}-${Math.floor(rng() * 10000)}`,
    assignments: newAssignments,
  };
}

/** Move 3: Swap assignment execution ordering between two unlocked incidents. */
export function swapOrderMove(
  plan: DispatchPlan,
  _scenario: Scenario,
  rng: RNG,
  lockedIncidentIds?: Set<string>
): DispatchPlan | null {
  const eligibleIndices: number[] = [];
  for (let idx = 0; idx < plan.assignments.length; idx++) {
    if (!lockedIncidentIds?.has(plan.assignments[idx]!.incidentId)) {
      eligibleIndices.push(idx);
    }
  }
  if (eligibleIndices.length < 2) return null;

  const newAssignments = plan.assignments.map((a) => ({ ...a }));
  const i = eligibleIndices[Math.floor(rng() * eligibleIndices.length)]!;
  let j = eligibleIndices[Math.floor(rng() * eligibleIndices.length)]!;
  while (j === i) {
    j = eligibleIndices[Math.floor(rng() * eligibleIndices.length)]!;
  }

  const temp = newAssignments[i]!;
  newAssignments[i] = newAssignments[j]!;
  newAssignments[j] = temp;

  return {
    ...plan,
    id: `hc-swaporder-${Date.now()}-${Math.floor(rng() * 10000)}`,
    assignments: newAssignments,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clonePlan(plan: DispatchPlan): DispatchPlan {
  return {
    ...plan,
    assignments: plan.assignments.map((a) => ({ ...a })),
  };
}

/**
 * Create a shuffled variant of a plan for random restarts.
 * Preserves locked assignments without mutation.
 */
function randomizePlan(
  basePlan: DispatchPlan,
  scenario: Scenario,
  rng: RNG,
  lockedIncidentIds?: Set<string>
): DispatchPlan {
  const teamIds = scenario.teams.map((t) => t.id);
  const newAssignments: Assignment[] = basePlan.assignments.map((a) => {
    if (lockedIncidentIds?.has(a.incidentId)) {
      return { ...a };
    }
    return {
      ...a,
      teamId: teamIds[Math.floor(rng() * teamIds.length)]!,
      routeIndex: Math.floor(rng() * 3),
    };
  });

  return {
    ...basePlan,
    id: `restart-${Date.now()}-${Math.floor(rng() * 10000)}`,
    assignments: newAssignments,
  };
}
