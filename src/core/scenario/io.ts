import { CityGraph, Scenario, ScenarioSchema } from '../model/schema';

const MAX_SCENARIO_JSON_BYTES = 1024 * 1024; // 1 MB limit

/**
 * Checks for prototype pollution patterns in raw JSON string.
 */
function checkPrototypePollution(jsonStr: string): void {
  if (
    jsonStr.includes('__proto__') ||
    jsonStr.includes('"constructor"') ||
    jsonStr.includes('"prototype"')
  ) {
    throw new Error('Security Error: Scenario JSON contains prohibited prototype pollution keys');
  }
}

/**
 * Exports a scenario to a formatted JSON string.
 */
export function exportScenario(scenario: Scenario): string {
  // Validate schema before serializing
  ScenarioSchema.parse(scenario);
  return JSON.stringify(scenario, null, 2);
}

/**
 * Imports and validates a scenario JSON string against the current city graph.
 * Enforces size limits, prototype security, schema validation, and node references.
 */
export function importScenario(jsonStr: string, graph: CityGraph): Scenario {
  // 1. Size check
  const byteLength = new TextEncoder().encode(jsonStr).length;
  if (byteLength > MAX_SCENARIO_JSON_BYTES) {
    throw new Error(`Scenario file exceeds 1 MB size limit (${byteLength} bytes)`);
  }

  // 2. Prototype pollution security check
  checkPrototypePollution(jsonStr);

  // 3. JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Zod schema validation
  const result = ScenarioSchema.safeParse(parsed);
  if (!result.success) {
    const errorDetails = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Scenario validation failed: ${errorDetails}`);
  }

  const scenario = result.data;

  // 5. Verify graph node existence
  for (const fac of scenario.facilities) {
    if (!graph.nodes[fac.node]) {
      throw new Error(`Facility "${fac.name}" references non-existent node: ${fac.node}`);
    }
  }

  for (const inc of scenario.incidents) {
    if (!graph.nodes[inc.node]) {
      throw new Error(`Incident "${inc.id}" references non-existent node: ${inc.node}`);
    }
    if (inc.blockedEdgeId) {
      const edgeExists = graph.edges.some(e => e.id === inc.blockedEdgeId);
      if (!edgeExists) {
        throw new Error(`Incident "${inc.id}" references non-existent blocked road edge: ${inc.blockedEdgeId}`);
      }
    }
  }

  for (const team of scenario.teams) {
    if (!graph.nodes[team.depotNode]) {
      throw new Error(`Team "${team.name}" references non-existent depot node: ${team.depotNode}`);
    }
    if (!graph.nodes[team.currentNode]) {
      throw new Error(`Team "${team.name}" references non-existent current node: ${team.currentNode}`);
    }
  }

  return scenario;
}
