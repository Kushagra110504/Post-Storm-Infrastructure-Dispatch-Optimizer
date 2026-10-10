import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineDistance } from '../src/core/graph/haversine';
import { computeBBox, projectLatLon } from '../src/core/graph/projection';
import { CityEdge, CityGraph, CityNode, Place, PlacesData } from '../src/core/model/schema';

// Generate ~40 nodes in an 8x5 grid around central Jaipur coordinates
const minLat = 26.900;
const maxLat = 26.935;
const minLon = 26.800;
const maxLon = 26.835;

const bbox = computeBBox(minLat, minLon, maxLat, maxLon);

const STREET_NAMES_EW = [
  'MI Road',
  'Ashok Marg',
  'Tripolia Bazaar',
  'Chandpole Bazaar',
  'Prithviraj Road',
];

const STREET_NAMES_NS = [
  'JLN Marg',
  'Tonk Road',
  'Sansar Chandra Road',
  'Mirza Ismail Link',
  'Johari Bazaar Road',
  'Kishanpole Bazaar Road',
  'Chaura Rasta',
  'Station Road',
];

const nodes: Record<string, CityNode> = {};
const edges: CityEdge[] = [];

const rows = 5;
const cols = 8;

for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const id = `mini_n_${r}_${c}`;
    const lat = minLat + (r / (rows - 1)) * (maxLat - minLat);
    const lon = minLon + (c / (cols - 1)) * (maxLon - minLon);
    const proj = projectLatLon(lat, lon, minLat, minLon, maxLat, maxLon);

    nodes[id] = {
      id,
      lat: Math.round(lat * 1000000) / 1000000,
      lon: Math.round(lon * 1000000) / 1000000,
      x: proj.x,
      y: proj.y,
    };
  }
}

let edgeCount = 0;

// East-West edges
for (let r = 0; r < rows; r++) {
  const streetName = STREET_NAMES_EW[r] || 'Central Connector';
  for (let c = 0; c < cols - 1; c++) {
    const fromId = `mini_n_${r}_${c}`;
    const toId = `mini_n_${r}_${c + 1}`;
    const n1 = nodes[fromId]!;
    const n2 = nodes[toId]!;

    const dist = haversineDistance(n1.lat, n1.lon, n2.lat, n2.lon);
    edgeCount++;
    const isOneway = r % 2 === 1 && c % 3 === 0;

    edges.push({
      id: `mini_e_${edgeCount}`,
      from: fromId,
      to: toId,
      length: Math.round(dist * 10) / 10,
      speed: 30,
      name: streetName,
      geometry: [
        [n1.lat, n1.lon],
        [Math.round(((n1.lat + n2.lat) / 2) * 1000000) / 1000000, Math.round(((n1.lon + n2.lon) / 2) * 1000000) / 1000000],
        [n2.lat, n2.lon],
      ],
      oneway: isOneway,
      blocked: false,
      highwayType: 'secondary',
    });

    if (!isOneway) {
      edgeCount++;
      edges.push({
        id: `mini_e_${edgeCount}`,
        from: toId,
        to: fromId,
        length: Math.round(dist * 10) / 10,
        speed: 30,
        name: streetName,
        geometry: [
          [n2.lat, n2.lon],
          [Math.round(((n1.lat + n2.lat) / 2) * 1000000) / 1000000, Math.round(((n1.lon + n2.lon) / 2) * 1000000) / 1000000],
          [n1.lat, n1.lon],
        ],
        oneway: false,
        blocked: false,
        highwayType: 'secondary',
      });
    }
  }
}

// North-South edges
for (let c = 0; c < cols; c++) {
  const streetName = STREET_NAMES_NS[c] || 'North-South Arterial';
  for (let r = 0; r < rows - 1; r++) {
    const fromId = `mini_n_${r}_${c}`;
    const toId = `mini_n_${r + 1}_${c}`;
    const n1 = nodes[fromId]!;
    const n2 = nodes[toId]!;

    const dist = haversineDistance(n1.lat, n1.lon, n2.lat, n2.lon);
    edgeCount++;
    const isBridge = r === 2 && c === 3;

    edges.push({
      id: `mini_e_${edgeCount}`,
      from: fromId,
      to: toId,
      length: Math.round(dist * 10) / 10,
      speed: 40,
      name: streetName,
      geometry: [
        [n1.lat, n1.lon],
        [n2.lat, n2.lon],
      ],
      oneway: false,
      blocked: false,
      highwayType: 'primary',
      bridge: isBridge ? true : undefined,
    });

    edgeCount++;
    edges.push({
      id: `mini_e_${edgeCount}`,
      from: toId,
      to: fromId,
      length: Math.round(dist * 10) / 10,
      speed: 40,
      name: streetName,
      geometry: [
        [n2.lat, n2.lon],
        [n1.lat, n1.lon],
      ],
      oneway: false,
      blocked: false,
      highwayType: 'primary',
      bridge: isBridge ? true : undefined,
    });
  }
}

const miniCity: CityGraph = {
  cityName: 'Jaipur (Mini Test Grid)',
  bbox,
  nodes,
  edges,
  versionHash: 'mini-city-fixture-v1',
};

const places: Place[] = [
  {
    id: 'mini_place_1',
    name: 'SMS Hospital Jaipur',
    type: 'hospital',
    lat: nodes['mini_n_2_2']!.lat,
    lon: nodes['mini_n_2_2']!.lon,
    nearestNodeId: 'mini_n_2_2',
    distanceToNode: 0,
  },
  {
    id: 'mini_place_2',
    name: 'Santokba Durlabhji Memorial Hospital',
    type: 'hospital',
    lat: nodes['mini_n_1_5']!.lat,
    lon: nodes['mini_n_1_5']!.lon,
    nearestNodeId: 'mini_n_1_5',
    distanceToNode: 0,
  },
  {
    id: 'mini_place_3',
    name: 'Amanishah Pumping Station',
    type: 'water_facility',
    lat: nodes['mini_n_0_1']!.lat,
    lon: nodes['mini_n_0_1']!.lon,
    nearestNodeId: 'mini_n_0_1',
    distanceToNode: 0,
  },
  {
    id: 'mini_place_4',
    name: 'Pink City Telecom Mast',
    type: 'telecom_mast',
    lat: nodes['mini_n_4_4']!.lat,
    lon: nodes['mini_n_4_4']!.lon,
    nearestNodeId: 'mini_n_4_4',
    distanceToNode: 0,
  },
  {
    id: 'mini_place_5',
    name: 'Jaipur Central Police HQ',
    type: 'police',
    lat: nodes['mini_n_3_6']!.lat,
    lon: nodes['mini_n_3_6']!.lon,
    nearestNodeId: 'mini_n_3_6',
    distanceToNode: 0,
  },
  {
    id: 'mini_place_6',
    name: 'Jaipur Municipal Corporation (Town Hall)',
    type: 'townhall',
    lat: nodes['mini_n_3_1']!.lat,
    lon: nodes['mini_n_3_1']!.lon,
    nearestNodeId: 'mini_n_3_1',
    distanceToNode: 0,
  },
  {
    id: 'mini_place_7',
    name: 'Jal Mahal Grid Substation',
    type: 'power_substation',
    lat: nodes['mini_n_4_7']!.lat,
    lon: nodes['mini_n_4_7']!.lon,
    nearestNodeId: 'mini_n_4_7',
    distanceToNode: 0,
  },
  {
    id: 'mini_place_8',
    name: 'Old City Fire HQ',
    type: 'fire_station',
    lat: nodes['mini_n_0_6']!.lat,
    lon: nodes['mini_n_0_6']!.lon,
    nearestNodeId: 'mini_n_0_6',
    distanceToNode: 0,
  },
];

const miniPlaces: PlacesData = {
  places,
};

const fixturesDir = path.resolve(process.cwd(), 'tests', 'fixtures');
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

fs.writeFileSync(path.join(fixturesDir, 'mini-city.json'), JSON.stringify(miniCity, null, 2));
fs.writeFileSync(path.join(fixturesDir, 'mini-places.json'), JSON.stringify(miniPlaces, null, 2));

console.log(`Generated mini-city fixture with ${Object.keys(nodes).length} nodes and ${edges.length} edges.`);
