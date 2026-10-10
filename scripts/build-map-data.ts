import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineDistance, polylineLength } from '../src/core/graph/haversine';
import { computeBBox, projectLatLon } from '../src/core/graph/projection';
import {
  CityEdge,
  CityGraph,
  CityGraphSchema,
  CityNode,
  Place,
  PlacesData,
  PlacesDataSchema,
  PlaceType,
} from '../src/core/model/schema';

// Bounding box for central Jaipur (~5.5 x 5.0 km, covering SMS Hospital, Pink City, Walled City, Civil Lines)
const DEFAULT_BBOX = {
  minLat: 26.890,
  minLon: 75.790,
  maxLat: 26.940,
  maxLon: 75.840,
};

const CITY_NAME = 'Jaipur, Rajasthan, India';

const HIGHWAY_SPEEDS: Record<string, number> = {
  motorway: 60,
  trunk: 50,
  primary: 40,
  secondary: 30,
  tertiary: 25,
  residential: 20,
  unclassified: 20,
};

const ALLOWED_HIGHWAYS = new Set(Object.keys(HIGHWAY_SPEEDS));

interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OsmWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  center?: { lat: number; lon: number };
}

type OsmElement = OsmNode | OsmWay;

interface OverpassResponse {
  elements: OsmElement[];
}

function buildOverpassQuery(bbox: typeof DEFAULT_BBOX): string {
  const { minLat, minLon, maxLat, maxLon } = bbox;
  const b = `${minLat},${minLon},${maxLat},${maxLon}`;
  return `[out:json][timeout:60];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"](${b});
);
out geom;
(
  node["amenity"="hospital"](${b});
  node["amenity"="fire_station"](${b});
  node["amenity"="police"](${b});
  node["amenity"="townhall"](${b});
  way["amenity"~"hospital|fire_station|police|townhall"](${b});
  node["power"~"substation|transformer"](${b});
  way["power"~"substation|transformer"](${b});
  node["man_made"~"water_works|pumping_station|water_tower|mast|tower"](${b});
  way["man_made"~"water_works|pumping_station|water_tower"](${b});
);
out center;`;
}

async function fetchFromOverpass(query: string): Promise<OverpassResponse> {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  let lastError: Error | null = null;
  for (const url of endpoints) {
    try {
      console.log(`Fetching map data from ${url}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'GridRescue/1.0 (emergency dispatch simulation research)',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'data=' + encodeURIComponent(query),
      });

      if (!res.ok) {
        throw new Error(`Overpass returned status ${res.status}: ${res.statusText}`);
      }
      const data = (await res.json()) as OverpassResponse;
      console.log(`Fetched ${data.elements?.length || 0} elements from ${url}.`);
      return data;
    } catch (err: unknown) {
      console.warn(`Fetch from ${url} failed: ${(err as Error).message}`);
      lastError = err as Error;
    }
  }

  throw new Error(
    `Failed to fetch from Overpass API. ${lastError?.message || ''}\n` +
      `Offline fallback: please run with --input <file.osm.json> to use a pre-downloaded OSM export.`,
  );
}

function processOsmData(
  osmData: OverpassResponse,
  bbox: typeof DEFAULT_BBOX,
): { cityGraph: CityGraph; placesData: PlacesData } {
  const rawNodes = new Map<number, { lat: number; lon: number }>();
  const rawWays: OsmWay[] = [];
  const rawFeatureNodes: OsmNode[] = [];
  const rawFeatureWays: OsmWay[] = [];

  for (const el of osmData.elements) {
    if (el.type === 'node') {
      rawNodes.set(el.id, { lat: el.lat, lon: el.lon });
      if (el.tags && hasFeatureTags(el.tags)) {
        rawFeatureNodes.push(el);
      }
    } else if (el.type === 'way') {
      if (el.geometry && el.nodes && el.geometry.length === el.nodes.length) {
        for (let i = 0; i < el.nodes.length; i++) {
          const nid = el.nodes[i]!;
          const pt = el.geometry[i]!;
          rawNodes.set(nid, { lat: pt.lat, lon: pt.lon });
        }
      }

      if (el.tags?.highway && ALLOWED_HIGHWAYS.has(el.tags.highway)) {
        rawWays.push(el);
      } else if (el.tags && hasFeatureTags(el.tags)) {
        rawFeatureWays.push(el);
      }
    }
  }

  console.log(`Indexed ${rawNodes.size} nodes and ${rawWays.length} routable road segments.`);

  // Count node appearances across all ways to identify intersections
  const nodeAppearanceCount = new Map<number, number>();
  for (const way of rawWays) {
    for (const nid of way.nodes) {
      nodeAppearanceCount.set(nid, (nodeAppearanceCount.get(nid) || 0) + 1);
    }
  }

  interface TempEdge {
    id: string;
    from: string;
    to: string;
    length: number;
    speed: number;
    name: string;
    geometry: Array<[number, number]>;
    oneway: boolean;
    highwayType: string;
    bridge?: boolean;
    tunnel?: boolean;
  }

  const tempEdges: TempEdge[] = [];
  const keyNodes = new Set<number>();
  let edgeCounter = 0;

  for (const way of rawWays) {
    const highway = way.tags?.highway || 'unclassified';
    const speed = HIGHWAY_SPEEDS[highway] || 25;
    const name = way.tags?.name || way.tags?.['name:en'] || 'Unnamed Road';
    const isBridge = way.tags?.bridge === 'yes';
    const isTunnel = way.tags?.tunnel === 'yes' || way.tags?.layer === '-1';

    let oneway = false;
    let reverse = false;
    if (way.tags?.oneway === 'yes' || way.tags?.oneway === '1' || way.tags?.oneway === 'true') {
      oneway = true;
    } else if (way.tags?.oneway === '-1') {
      oneway = true;
      reverse = true;
    }

    const wayNodes = reverse ? [...way.nodes].reverse() : way.nodes;
    if (wayNodes.length < 2) continue;

    // Split way at key nodes (endpoints or appearances > 1)
    let segmentStartIdx = 0;
    for (let i = 1; i < wayNodes.length; i++) {
      const nid = wayNodes[i]!;
      const isEndpoint = i === wayNodes.length - 1 || (nodeAppearanceCount.get(nid) || 0) > 1;

      if (isEndpoint) {
        const uId = wayNodes[segmentStartIdx]!;
        const vId = nid;

        const subNodes = wayNodes.slice(segmentStartIdx, i + 1);
        const geometry: Array<[number, number]> = [];

        for (const sn of subNodes) {
          const coord = rawNodes.get(sn);
          if (coord) {
            geometry.push([coord.lat, coord.lon]);
          }
        }

        if (geometry.length >= 2) {
          keyNodes.add(uId);
          keyNodes.add(vId);

          const len = polylineLength(geometry);
          edgeCounter++;
          tempEdges.push({
            id: `edge_${way.id}_${edgeCounter}`,
            from: `node_${uId}`,
            to: `node_${vId}`,
            length: Math.round(len * 10) / 10,
            speed,
            name,
            geometry,
            oneway,
            highwayType: highway,
            bridge: isBridge ? true : undefined,
            tunnel: isTunnel ? true : undefined,
          });
        }

        segmentStartIdx = i;
      }
    }
  }

  console.log(`Contracted into ${keyNodes.size} key intersection nodes and ${tempEdges.length} edges.`);

  // Find largest connected component (undirected connectivity)
  const adj = new Map<string, string[]>();
  for (const n of keyNodes) {
    adj.set(`node_${n}`, []);
  }
  for (const e of tempEdges) {
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }

  const visited = new Set<string>();
  let largestComponent = new Set<string>();

  for (const n of keyNodes) {
    const nodeId = `node_${n}`;
    if (!visited.has(nodeId)) {
      const component = new Set<string>();
      const queue = [nodeId];
      visited.add(nodeId);

      while (queue.length > 0) {
        const curr = queue.pop()!;
        component.add(curr);
        for (const neighbor of adj.get(curr) || []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      if (component.size > largestComponent.size) {
        largestComponent = component;
      }
    }
  }

  console.log(`Largest connected component has ${largestComponent.size} nodes.`);

  // Filter edges to largest connected component
  const finalEdges: CityEdge[] = tempEdges
    .filter((e) => largestComponent.has(e.from) && largestComponent.has(e.to))
    .map((e) => ({
      ...e,
      blocked: false,
    }));

  // Build projected nodes
  const projectedNodes: Record<string, CityNode> = {};
  for (const n of keyNodes) {
    const nodeId = `node_${n}`;
    if (largestComponent.has(nodeId)) {
      const raw = rawNodes.get(n);
      if (raw) {
        const proj = projectLatLon(
          raw.lat,
          raw.lon,
          bbox.minLat,
          bbox.minLon,
          bbox.maxLat,
          bbox.maxLon,
        );
        projectedNodes[nodeId] = {
          id: nodeId,
          lat: raw.lat,
          lon: raw.lon,
          x: proj.x,
          y: proj.y,
        };
      }
    }
  }

  // Snap feature places to nearest node in largest connected component
  const places: Place[] = [];
  const allFeatures: Array<{ name: string; type: PlaceType; lat: number; lon: number }> = [];

  for (const fn of rawFeatureNodes) {
    const type = classifyFeature(fn.tags || {});
    if (type) {
      const name = getFeatureName(fn.tags || {}, type);
      allFeatures.push({ name, type, lat: fn.lat, lon: fn.lon });
    }
  }

  for (const fw of rawFeatureWays) {
    const type = classifyFeature(fw.tags || {});
    if (type) {
      let lat = fw.center?.lat;
      let lon = fw.center?.lon;
      if (lat === undefined || lon === undefined) {
        let sumLat = 0;
        let sumLon = 0;
        let count = 0;
        for (const nid of fw.nodes) {
          const coord = rawNodes.get(nid);
          if (coord) {
            sumLat += coord.lat;
            sumLon += coord.lon;
            count++;
          }
        }
        if (count > 0) {
          lat = sumLat / count;
          lon = sumLon / count;
        }
      }

      if (lat !== undefined && lon !== undefined) {
        const name = getFeatureName(fw.tags || {}, type);
        allFeatures.push({ name, type, lat, lon });
      }
    }
  }

  // Snap places to nearest node in graph
  const nodeEntries = Object.values(projectedNodes);
  let placeIdx = 0;

  for (const feat of allFeatures) {
    let nearestNodeId = '';
    let minDist = Infinity;

    for (const node of nodeEntries) {
      const d = haversineDistance(feat.lat, feat.lon, node.lat, node.lon);
      if (d < minDist) {
        minDist = d;
        nearestNodeId = node.id;
      }
    }

    if (nearestNodeId && minDist <= 1500) {
      placeIdx++;
      places.push({
        id: `place_${placeIdx}`,
        name: feat.name,
        type: feat.type,
        lat: feat.lat,
        lon: feat.lon,
        nearestNodeId,
        distanceToNode: Math.round(minDist * 10) / 10,
      });
    }
  }

  console.log(`Extracted and snapped ${places.length} named facilities.`);

  const calculatedBBox = computeBBox(bbox.minLat, bbox.minLon, bbox.maxLat, bbox.maxLon);

  const cityGraph: CityGraph = {
    cityName: CITY_NAME,
    bbox: calculatedBBox,
    nodes: projectedNodes,
    edges: finalEdges,
    versionHash: 'jaipur-osm-v1',
  };

  const placesData: PlacesData = {
    places,
  };

  return { cityGraph, placesData };
}

function hasFeatureTags(tags: Record<string, string>): boolean {
  return (
    tags.amenity === 'hospital' ||
    tags.amenity === 'fire_station' ||
    tags.amenity === 'police' ||
    tags.amenity === 'townhall' ||
    tags.office === 'government' ||
    tags.power === 'substation' ||
    tags.power === 'transformer' ||
    Boolean(tags.telecom) ||
    tags['tower:type'] === 'communication' ||
    ['water_works', 'pumping_station', 'water_tower', 'mast', 'tower'].includes(tags.man_made || '')
  );
}

function classifyFeature(tags: Record<string, string>): PlaceType | null {
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.amenity === 'fire_station') return 'fire_station';
  if (tags.amenity === 'police') return 'police';
  if (tags.amenity === 'townhall' || tags.office === 'government') return 'townhall';
  if (tags.power === 'substation' || tags.power === 'transformer') return 'power_substation';
  if (['water_works', 'pumping_station', 'water_tower'].includes(tags.man_made || '')) {
    return 'water_facility';
  }
  if (
    tags.man_made === 'mast' ||
    tags.man_made === 'tower' ||
    tags.telecom ||
    tags['tower:type'] === 'communication'
  ) {
    return 'telecom_mast';
  }
  return null;
}

function getFeatureName(tags: Record<string, string>, type: PlaceType): string {
  if (tags.name) return tags.name;
  if (tags['name:en']) return tags['name:en'];
  if (tags.operator) return `${tags.operator} (${type})`;
  if (tags.ref) return `${type.replace('_', ' ')} ${tags.ref}`;
  return `Central Jaipur ${type.replace('_', ' ')}`;
}

async function main() {
  const args = process.argv.slice(2);
  let inputFile: string | null = null;
  let printStatsOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputFile = args[i + 1]!;
      i++;
    } else if (args[i] === '--stats') {
      printStatsOnly = true;
    }
  }

  const dataDir = path.resolve(process.cwd(), 'data');
  const cityPath = path.join(dataDir, 'city.json');
  const placesPath = path.join(dataDir, 'places.json');

  if (printStatsOnly) {
    printDatasetStats(cityPath, placesPath);
    return;
  }

  let osmData: OverpassResponse;

  if (inputFile) {
    console.log(`Reading input from ${inputFile}...`);
    const content = fs.readFileSync(path.resolve(process.cwd(), inputFile), 'utf-8');
    osmData = JSON.parse(content) as OverpassResponse;
  } else {
    const query = buildOverpassQuery(DEFAULT_BBOX);
    osmData = await fetchFromOverpass(query);
  }

  const { cityGraph, placesData } = processOsmData(osmData, DEFAULT_BBOX);

  console.log('Validating generated graph with Zod...');
  CityGraphSchema.parse(cityGraph);
  PlacesDataSchema.parse(placesData);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(cityPath, JSON.stringify(cityGraph));
  fs.writeFileSync(placesPath, JSON.stringify(placesData, null, 2));

  console.log(`Saved ${cityPath} and ${placesPath}`);
  printDatasetStats(cityPath, placesPath);
}

function printDatasetStats(cityPath: string, placesPath: string) {
  if (!fs.existsSync(cityPath) || !fs.existsSync(placesPath)) {
    console.error(`Files not found: ${cityPath} or ${placesPath}`);
    return;
  }

  const city = JSON.parse(fs.readFileSync(cityPath, 'utf-8')) as CityGraph;
  const places = JSON.parse(fs.readFileSync(placesPath, 'utf-8')) as PlacesData;

  const cityStat = fs.statSync(cityPath);
  const placesStat = fs.statSync(placesPath);

  const placesByType: Record<string, number> = {};
  for (const p of places.places) {
    placesByType[p.type] = (placesByType[p.type] || 0) + 1;
  }

  console.log('=== GridRescue Map Dataset Statistics ===');
  console.log(`City: ${city.cityName}`);
  console.log(`Nodes: ${Object.keys(city.nodes).length}`);
  console.log(`Edges: ${city.edges.length}`);
  console.log(`Bounding Box (lat/lon): [${city.bbox.minLat}, ${city.bbox.minLon}] to [${city.bbox.maxLat}, ${city.bbox.maxLon}]`);
  console.log(`Bounding Box (meters): ${Math.round(city.bbox.maxX)}m x ${Math.round(city.bbox.maxY)}m`);
  console.log('Facilities by type:');
  for (const [type, count] of Object.entries(placesByType)) {
    console.log(`  - ${type}: ${count}`);
  }
  console.log(`File sizes:`);
  console.log(`  - city.json: ${(cityStat.size / 1024).toFixed(1)} KB`);
  console.log(`  - places.json: ${(placesStat.size / 1024).toFixed(1)} KB`);
  console.log('==========================================');
}

main().catch((err) => {
  console.error('Fatal error in build-map-data:', err);
  process.exit(1);
});

export { processOsmData, DEFAULT_BBOX, CITY_NAME, printDatasetStats };
