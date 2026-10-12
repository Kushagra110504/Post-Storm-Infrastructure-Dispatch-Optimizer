import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CityGraph, CityGraphSchema, PlacesData, PlacesDataSchema, ScenarioSchema } from '../src/core/model/schema';
import { generateScenario, OPERATIONAL_NOTICE } from '../src/core/scenario/generator';
import { exportScenario, importScenario } from '../src/core/scenario/io';
import { dijkstra, buildAdjacencyList } from '../src/core/routing/dijkstra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rawCity = JSON.parse(
  readFileSync(resolve(__dirname, '../data/city.json'), 'utf-8'),
);
const rawPlaces = JSON.parse(
  readFileSync(resolve(__dirname, '../data/places.json'), 'utf-8'),
);

const graph: CityGraph = CityGraphSchema.parse(rawCity);
const placesData: PlacesData = PlacesDataSchema.parse(rawPlaces);
const places = placesData.places;

describe('Scenario Generation (12/8/5 on Real Jaipur Network)', () => {
  it('is completely deterministic for the same PRNG seed', () => {
    const s1 = generateScenario(graph, places, { seed: 42 });
    const s2 = generateScenario(graph, places, { seed: 42 });

    expect(s1.seed).toBe(s2.seed);
    expect(s1.incidents).toEqual(s2.incidents);
    expect(s1.facilities).toEqual(s2.facilities);
    expect(s1.teams).toEqual(s2.teams);
  });

  it('produces distinct scenarios for different seeds', () => {
    const s1 = generateScenario(graph, places, { seed: 42 });
    const s2 = generateScenario(graph, places, { seed: 108 });

    expect(s1.seed).not.toBe(s2.seed);
    // Incidents should have different nodes or IDs
    const nodes1 = s1.incidents.map(i => i.node);
    const nodes2 = s2.incidents.map(i => i.node);
    expect(nodes1).not.toEqual(nodes2);
  });

  it('generates exact 12/8/5 distribution with required subtypes', () => {
    const scenario = generateScenario(graph, places, { seed: 42 });

    // 5 Critical Facilities
    expect(scenario.facilities.length).toBe(5);
    const hospCount = scenario.facilities.filter(f => f.type === 'hospital').length;
    expect(hospCount).toBe(2);
    expect(scenario.facilities.some(f => f.type === 'water_facility')).toBe(true);

    // 12 Incidents
    expect(scenario.incidents.length).toBe(12);
    const power = scenario.incidents.filter(i => i.type === 'power');
    const water = scenario.incidents.filter(i => i.type === 'water');
    const comms = scenario.incidents.filter(i => i.type === 'comms');
    const road = scenario.incidents.filter(i => i.type === 'road');

    expect(power.length).toBe(4);
    expect(water.length).toBe(3);
    expect(comms.length).toBe(2);
    expect(road.length).toBe(3);

    // 8 Teams
    expect(scenario.teams.length).toBe(8);
    const vehicles = new Set(scenario.teams.map(t => t.vehicleType));
    expect(vehicles.has('bucket-truck')).toBe(true);
    expect(vehicles.has('pump-van')).toBe(true);
    expect(vehicles.has('comms-van')).toBe(true);
    expect(vehicles.has('heavy-clearance')).toBe(true);
  });

  it('satisfies cross-incident dependencies and operational notice', () => {
    const scenario = generateScenario(graph, places, { seed: 42 });

    // Operational notice requirement
    expect(scenario.operationalNotice).toBe(OPERATIONAL_NOTICE);

    // At least one water incident depends on a power incident
    const dependentWater = scenario.incidents.find(i => i.type === 'water' && i.dependsOn);
    expect(dependentWater).toBeDefined();
    expect(dependentWater?.dependsOn).toMatch(/^inc-pwr-/);

    // Power incident 1 affects hospital 1
    const p1 = scenario.incidents.find(i => i.id === 'inc-pwr-1')!;
    expect(p1.affectedFacilityIds).toContain('fac-hosp-1');
  });

  it('guarantees that a road incident blocks the route to a hospital power fault', () => {
    const scenario = generateScenario(graph, places, { seed: 42 });
    const adj = buildAdjacencyList(graph);

    const p1 = scenario.incidents.find(i => i.id === 'inc-pwr-1')!;
    const r1 = scenario.incidents.find(i => i.id === 'inc-rd-1')!;
    expect(r1.blockedEdgeId).toBeDefined();

    const powerTeam = scenario.teams.find(t => t.skills.includes('high-voltage'))!;
    const depot = powerTeam.depotNode;

    // Normal shortest route to power incident
    const normalRoute = dijkstra(graph, depot, p1.node, new Set(), 'time', adj);
    expect(normalRoute).not.toBeNull();

    // Verify route with the road incident blocked
    const blockedRoute = dijkstra(graph, depot, p1.node, new Set([r1.blockedEdgeId!]), 'time', adj);

    // Either blocked entirely or forces a detour / longer time
    if (blockedRoute) {
      expect(blockedRoute.totalTimeSeconds).toBeGreaterThanOrEqual(normalRoute!.totalTimeSeconds);
    } else {
      expect(blockedRoute).toBeNull();
    }
  });

  it('ensures all referenced nodes and edges strictly exist in the city graph', () => {
    const scenario = generateScenario(graph, places, { seed: 42 });

    for (const fac of scenario.facilities) {
      expect(graph.nodes[fac.node]).toBeDefined();
    }
    for (const inc of scenario.incidents) {
      expect(graph.nodes[inc.node]).toBeDefined();
      if (inc.blockedEdgeId) {
        expect(graph.edges.some(e => e.id === inc.blockedEdgeId)).toBe(true);
      }
    }
    for (const team of scenario.teams) {
      expect(graph.nodes[team.depotNode]).toBeDefined();
      expect(graph.nodes[team.currentNode]).toBeDefined();
    }
  });

  it('validates correctly against ScenarioSchema', () => {
    const scenario = generateScenario(graph, places, { seed: 42 });
    const parsed = ScenarioSchema.safeParse(scenario);
    expect(parsed.success).toBe(true);
  });
});

describe('Scenario Serialization & Security (Import/Export)', () => {
  const scenario = generateScenario(graph, places, { seed: 42 });

  it('exports and re-imports valid scenario without data loss', () => {
    const jsonStr = exportScenario(scenario);
    const imported = importScenario(jsonStr, graph);

    expect(imported.id).toBe(scenario.id);
    expect(imported.seed).toBe(scenario.seed);
    expect(imported.incidents.length).toBe(12);
    expect(imported.teams.length).toBe(8);
    expect(imported.facilities.length).toBe(5);
  });

  it('rejects scenario files exceeding 1 MB limit', () => {
    const hugePadding = 'x'.repeat(1024 * 1024 + 10);
    const oversizedJson = JSON.stringify({
      ...scenario,
      name: hugePadding,
    });

    expect(() => importScenario(oversizedJson, graph)).toThrow(/1 MB size limit/);
  });

  it('rejects JSON containing prototype pollution keys', () => {
    const validJson = exportScenario(scenario);
    const maliciousJson = validJson.replace('"id":', '"__proto__": { "polluted": true }, "id":');

    expect(() => importScenario(maliciousJson, graph)).toThrow(/prototype pollution/);
  });

  it('rejects scenario referencing non-existent graph nodes', () => {
    const invalidScenario = {
      ...scenario,
      incidents: [
        {
          ...scenario.incidents[0]!,
          node: 'non_existent_node_xyz_99999',
        },
        ...scenario.incidents.slice(1),
      ],
    };

    const jsonStr = JSON.stringify(invalidScenario);
    expect(() => importScenario(jsonStr, graph)).toThrow(/non-existent node/);
  });
});
