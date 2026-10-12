import { CityGraph, Place, Scenario, CriticalFacility, Incident, Team } from '../model/schema';
import { createMulberry32 } from '../rng/mulberry32';
import { dijkstra, buildAdjacencyList } from '../routing/dijkstra';

export const OPERATIONAL_NOTICE =
  'Real map (OpenStreetMap), simulated incidents. Not actual infrastructure data.';

export interface GenerateScenarioOptions {
  seed?: number;
  name?: string;
}

/**
 * Deterministically generates a 12-incident / 8-team / 5-facility scenario
 * on the real city graph and places using Mulberry32 PRNG.
 */
export function generateScenario(
  graph: CityGraph,
  places: Place[],
  options: GenerateScenarioOptions = {},
): Scenario {
  const seed = options.seed ?? 42;
  const rng = createMulberry32(seed);

  // Helper: random float in [0, 1)
  const rand = () => rng();
  // Helper: random integer in [min, max] inclusive
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  // Helper: random element from array
  const pick = <T>(arr: T[]): T => {
    if (arr.length === 0) throw new Error('Cannot pick from empty array');
    return arr[Math.floor(rand() * arr.length)]!;
  };

  // Helper: shuffle array deterministically
  const shuffle = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = tmp;
    }
    return copy;
  };

  const adj = buildAdjacencyList(graph);

  // ── 1. Select 5 Critical Facilities ───────────────────────────────────────
  // 2 Hospitals, 1 Water Facility, 1 Telecom Hub, 1 Emergency Ops (Police/HQ)
  const hospitals = places.filter(p => p.type === 'hospital');
  const waterFacilities = places.filter(p => p.type === 'water_facility');
  const policeStations = places.filter(p => p.type === 'police' || p.type === 'fire_station' || p.type === 'townhall');
  const telecomMasts = places.filter(p => p.type === 'telecom_mast');

  if (hospitals.length < 2) throw new Error('Scenario requires at least 2 hospitals in places data');
  if (waterFacilities.length < 1) throw new Error('Scenario requires at least 1 water facility in places data');
  if (policeStations.length < 1) throw new Error('Scenario requires at least 1 emergency/police facility in places data');

  const shuffledHospitals = shuffle(hospitals);
  const h1 = shuffledHospitals[0]!;
  const h2 = shuffledHospitals[1]!;

  const chosenWater = pick(waterFacilities);
  const chosenEmergency = pick(policeStations);

  // For telecom, use telecom mast if available, else prominent telecommunications hub node
  let telecomNode = telecomMasts.length > 0 ? pick(telecomMasts).nearestNodeId : '';
  let telecomName = telecomMasts.length > 0 ? pick(telecomMasts).name : 'Central Jaipur Telecom Hub';
  if (!telecomNode) {
    // Pick an interior high-degree node for the telecom exchange
    const nodeIds = Object.keys(graph.nodes);
    telecomNode = nodeIds[Math.floor(nodeIds.length / 2)] ?? h1.nearestNodeId;
    telecomName = 'Jaipur Central Telecom Exchange';
  }

  const facilities: CriticalFacility[] = [
    {
      id: 'fac-hosp-1',
      name: h1.name,
      type: 'hospital',
      node: h1.nearestNodeId,
      criticalityWeight: 5.0,
      incidentIds: [],
    },
    {
      id: 'fac-hosp-2',
      name: h2.name,
      type: 'hospital',
      node: h2.nearestNodeId,
      criticalityWeight: 5.0,
      incidentIds: [],
    },
    {
      id: 'fac-water-1',
      name: chosenWater.name,
      type: 'water_facility',
      node: chosenWater.nearestNodeId,
      criticalityWeight: 4.0,
      incidentIds: [],
    },
    {
      id: 'fac-telecom-1',
      name: telecomName,
      type: 'telecom_mast',
      node: telecomNode,
      criticalityWeight: 3.0,
      incidentIds: [],
    },
    {
      id: 'fac-emg-1',
      name: chosenEmergency.name,
      type: 'police',
      node: chosenEmergency.nearestNodeId,
      criticalityWeight: 4.0,
      incidentIds: [],
    },
  ];

  // ── 2. Select 8 Team Depots ───────────────────────────────────────────────
  // Depots placed at real police stations, water facilities, or substations
  const depotPlaces = [...policeStations, ...places.filter(p => p.type === 'power_substation'), ...waterFacilities];
  const shuffledDepots = shuffle(depotPlaces);

  const teamDefs: Array<{
    name: string;
    skills: Array<'high-voltage' | 'pipe-repair' | 'telecom-fiber' | 'debris-clearance'>;
    vehicleType: 'bucket-truck' | 'pump-van' | 'comms-van' | 'heavy-clearance';
    equipment: Array<'generator' | 'excavator' | 'splicer' | 'chainsaw'>;
  }> = [
    { name: 'Power Squad Alpha', skills: ['high-voltage'], vehicleType: 'bucket-truck', equipment: ['generator'] },
    { name: 'Power Squad Bravo', skills: ['high-voltage'], vehicleType: 'bucket-truck', equipment: ['generator'] },
    { name: 'Water Works Unit 1', skills: ['pipe-repair'], vehicleType: 'pump-van', equipment: ['excavator'] },
    { name: 'Water Works Unit 2', skills: ['pipe-repair'], vehicleType: 'pump-van', equipment: ['excavator'] },
    { name: 'Telecom Fiber Crew 1', skills: ['telecom-fiber'], vehicleType: 'comms-van', equipment: ['splicer'] },
    { name: 'Telecom Fiber Crew 2', skills: ['telecom-fiber'], vehicleType: 'comms-van', equipment: ['splicer'] },
    { name: 'Clearance Engine 1', skills: ['debris-clearance'], vehicleType: 'heavy-clearance', equipment: ['chainsaw'] },
    { name: 'Clearance Engine 2', skills: ['debris-clearance'], vehicleType: 'heavy-clearance', equipment: ['chainsaw'] },
  ];

  const teams: Team[] = teamDefs.map((def, idx) => {
    const depotPlace = shuffledDepots[idx % shuffledDepots.length]!;
    return {
      id: `team-${idx + 1}`,
      name: def.name,
      depotNode: depotPlace.nearestNodeId,
      currentNode: depotPlace.nearestNodeId,
      skills: def.skills,
      vehicleType: def.vehicleType,
      equipment: def.equipment,
      speedFactor: 1.0,
      availableAt: 0,
      status: 'idle',
    };
  });

  // ── 3. Generate 12 Incidents ──────────────────────────────────────────────
  const incidents: Incident[] = [];

  // 3a. Power Incidents (4 total)
  // At least one power incident must be near hospital h1 (within ~600m), affecting h1
  const powerSubstations = places.filter(p => p.type === 'power_substation');
  const h1Node = graph.nodes[h1.nearestNodeId]!;

  // Find a substation or junction node near h1
  let nearHospPowerNodeId = '';
  let nearHospPowerName = '';
  for (const sub of powerSubstations) {
    const sn = graph.nodes[sub.nearestNodeId];
    if (sn) {
      const d = Math.sqrt((sn.x - h1Node.x) ** 2 + (sn.y - h1Node.y) ** 2);
      if (d < 1200) {
        nearHospPowerNodeId = sub.nearestNodeId;
        nearHospPowerName = sub.name;
        break;
      }
    }
  }

  // If no official substation was close enough, pick an intersection node within ~400m
  if (!nearHospPowerNodeId) {
    const neighborEdges = graph.edges.filter(e => e.from === h1.nearestNodeId || e.to === h1.nearestNodeId);
    const chosenEdge = neighborEdges[0] ?? graph.edges[0]!;
    nearHospPowerNodeId = chosenEdge.from === h1.nearestNodeId ? chosenEdge.to : chosenEdge.from;
    nearHospPowerName = `${h1.name} Sub-Transformer`;
  }

  const p1: Incident = {
    id: 'inc-pwr-1',
    type: 'power',
    node: nearHospPowerNodeId,
    placeName: nearHospPowerName || `${h1.name} Feeder Substation`,
    severity: 5,
    requiredSkill: 'high-voltage',
    requiredEquipment: 'generator',
    baseRepairTime: 60,
    affectedFacilityIds: ['fac-hosp-1'],
    reportedAt: 0,
  };
  incidents.push(p1);
  facilities[0]!.incidentIds.push(p1.id);

  // 3 other power incidents
  const otherPowerPlaces = shuffle(powerSubstations.length > 0 ? powerSubstations : places.slice(0, 5));
  for (let i = 1; i <= 3; i++) {
    const place = otherPowerPlaces[(i - 1) % otherPowerPlaces.length]!;
    const pInc: Incident = {
      id: `inc-pwr-${i + 1}`,
      type: 'power',
      node: place.nearestNodeId,
      placeName: place.name || `Feeder Station ${i + 1}`,
      severity: randInt(2, 4),
      requiredSkill: 'high-voltage',
      requiredEquipment: 'generator',
      baseRepairTime: randInt(40, 80),
      affectedFacilityIds: i === 1 ? ['fac-telecom-1'] : [],
      reportedAt: randInt(0, 15),
    };
    incidents.push(pInc);
    if (i === 1) facilities[3]!.incidentIds.push(pInc.id);
  }

  // 3b. Water Incidents (3 total)
  // One water incident depends on power incident inc-pwr-1
  const shuffledWater = shuffle(waterFacilities);
  for (let i = 0; i < 3; i++) {
    const wPlace = shuffledWater[i % shuffledWater.length]!;
    const wInc: Incident = {
      id: `inc-wtr-${i + 1}`,
      type: 'water',
      node: wPlace.nearestNodeId,
      placeName: wPlace.name || `Pumping Station ${i + 1}`,
      severity: randInt(3, 5),
      requiredSkill: 'pipe-repair',
      requiredEquipment: 'excavator',
      baseRepairTime: randInt(45, 90),
      affectedFacilityIds: ['fac-water-1'],
      dependsOn: i === 0 ? 'inc-pwr-1' : undefined, // Guaranteed dependency!
      reportedAt: randInt(5, 20),
    };
    incidents.push(wInc);
    facilities[2]!.incidentIds.push(wInc.id);
  }

  // 3c. Comms Incidents (2 total)
  for (let i = 0; i < 2; i++) {
    const cPlace = telecomMasts.length > 0 ? telecomMasts[i % telecomMasts.length]! : chosenEmergency;
    const cInc: Incident = {
      id: `inc-com-${i + 1}`,
      type: 'comms',
      node: cPlace.nearestNodeId,
      placeName: cPlace.name || `Telecom Tower ${i + 1}`,
      severity: randInt(2, 4),
      requiredSkill: 'telecom-fiber',
      requiredEquipment: 'splicer',
      baseRepairTime: randInt(30, 60),
      affectedFacilityIds: ['fac-telecom-1'],
      reportedAt: randInt(0, 10),
    };
    incidents.push(cInc);
    facilities[3]!.incidentIds.push(cInc.id);
  }

  // 3d. Road Incidents (3 total)
  // CRITICAL REQUIREMENT: At least one road incident MUST block the shortest route
  // to the hospital-linked power fault (p1), so ordering strictly matters!
  // Find shortest route from Power Team 1's depot to p1:
  const powerTeamDepot = teams[0]!.depotNode;
  const initialRoute = dijkstra(graph, powerTeamDepot, p1.node, new Set(), 'time', adj);

  let keyBlockedEdgeId = '';
  let keyRoadNodeId = '';
  let keyRoadName = '';

  if (initialRoute && initialRoute.edges.length > 0) {
    // Pick an edge in the middle or near destination of the shortest path
    const candidateIdx = Math.min(Math.floor(initialRoute.edges.length / 2), initialRoute.edges.length - 1);
    const chosenEdgeId = initialRoute.edges[candidateIdx]!;
    const edgeObj = graph.edges.find(e => e.id === chosenEdgeId);

    if (edgeObj) {
      // Verify that blocking this edge forces a detour or prevents direct transit
      const detouredRoute = dijkstra(graph, powerTeamDepot, p1.node, new Set([chosenEdgeId]), 'time', adj);
      if (!detouredRoute || detouredRoute.totalTimeSeconds > initialRoute.totalTimeSeconds) {
        keyBlockedEdgeId = chosenEdgeId;
        keyRoadNodeId = edgeObj.from;
        keyRoadName = edgeObj.name || 'JLN Marg Arterial Corridor';
      }
    }
  }

  // Fallback if graph was disconnected or single-edge: pick incident node's incident edge
  if (!keyBlockedEdgeId) {
    const incidentEdges = graph.edges.filter(e => e.from === p1.node || e.to === p1.node);
    const fallbackEdge = incidentEdges[0] ?? graph.edges[0]!;
    keyBlockedEdgeId = fallbackEdge.id;
    keyRoadNodeId = fallbackEdge.from;
    keyRoadName = fallbackEdge.name || 'Access Road';
  }

  const r1: Incident = {
    id: 'inc-rd-1',
    type: 'road',
    node: keyRoadNodeId,
    placeName: `${keyRoadName} Blockage`,
    severity: 5,
    requiredSkill: 'debris-clearance',
    requiredEquipment: 'chainsaw',
    baseRepairTime: 45,
    affectedFacilityIds: ['fac-hosp-1'],
    blockedEdgeId: keyBlockedEdgeId,
    reportedAt: 0,
  };
  incidents.push(r1);

  // 2 other road incidents on real named roads
  const namedEdges = graph.edges.filter(e => e.name.length > 2 && e.id !== keyBlockedEdgeId);
  const shuffledNamedEdges = shuffle(namedEdges.length >= 2 ? namedEdges : graph.edges);

  for (let i = 1; i <= 2; i++) {
    const edge = shuffledNamedEdges[i - 1]!;
    const rInc: Incident = {
      id: `inc-rd-${i + 1}`,
      type: 'road',
      node: edge.from,
      placeName: `${edge.name || 'Arterial Road'} Fallen Tree`,
      severity: randInt(2, 4),
      requiredSkill: 'debris-clearance',
      requiredEquipment: 'chainsaw',
      baseRepairTime: randInt(30, 60),
      affectedFacilityIds: [],
      blockedEdgeId: edge.id,
      reportedAt: randInt(5, 25),
    };
    incidents.push(rInc);
  }

  return {
    id: `scenario-${seed}`,
    name: options.name ?? `Jaipur Post-Storm Scenario (Seed ${seed})`,
    cityName: graph.cityName,
    cityVersionHash: graph.versionHash ?? 'city-v1',
    facilities,
    incidents,
    teams,
    seed,
    createdAt: new Date().toISOString(),
    operationalNotice: OPERATIONAL_NOTICE,
  };
}
