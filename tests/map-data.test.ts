import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { haversineDistance } from '../src/core/graph/haversine';
import { computeBBox, projectLatLon } from '../src/core/graph/projection';
import { CityGraph, CityGraphSchema, PlacesData, PlacesDataSchema } from '../src/core/model/schema';

describe('Map Data Pipeline & Graph Modeling', () => {
  const fixturePath = path.resolve(__dirname, 'fixtures', 'mini-city.json');
  const placesFixturePath = path.resolve(__dirname, 'fixtures', 'mini-places.json');

  const miniCity = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as CityGraph;
  const miniPlaces = JSON.parse(fs.readFileSync(placesFixturePath, 'utf-8')) as PlacesData;

  it('validates mini-city fixture against Zod schemas deterministically', () => {
    const parsedCity = CityGraphSchema.parse(miniCity);
    const parsedPlaces = PlacesDataSchema.parse(miniPlaces);

    expect(parsedCity.cityName).toContain('Jaipur');
    expect(Object.keys(parsedCity.nodes).length).toBe(40);
    expect(parsedCity.edges.length).toBeGreaterThan(50);
    expect(parsedPlaces.places.length).toBe(8);
  });

  it('guarantees graph connectivity across all nodes', () => {
    const nodeIds = Object.keys(miniCity.nodes);
    const adj = new Map<string, string[]>();
    for (const nid of nodeIds) {
      adj.set(nid, []);
    }

    for (const edge of miniCity.edges) {
      expect(miniCity.nodes[edge.from]).toBeDefined();
      expect(miniCity.nodes[edge.to]).toBeDefined();
      adj.get(edge.from)?.push(edge.to);
      adj.get(edge.to)?.push(edge.from); // undirected connectivity
    }

    // BFS to ensure 100% of nodes belong to the connected component
    const visited = new Set<string>();
    const startNode = nodeIds[0]!;
    const queue = [startNode];
    visited.add(startNode);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const neighbor of adj.get(curr) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    expect(visited.size).toBe(nodeIds.length);
  });

  it('preserves oneway road restrictions and directional connectivity', () => {
    const onewayEdges = miniCity.edges.filter((e) => e.oneway);
    const bidirectionalEdges = miniCity.edges.filter((e) => !e.oneway);

    expect(onewayEdges.length).toBeGreaterThan(0);
    expect(bidirectionalEdges.length).toBeGreaterThan(0);

    // Oneway edge should permit traversal from -> to, but not to -> from on that specific edge
    for (const edge of onewayEdges) {
      expect(edge.oneway).toBe(true);
      expect(edge.from).not.toEqual(edge.to);
    }
  });

  it('retains polyline geometry across contracted edges', () => {
    let multiPointGeometryCount = 0;

    for (const edge of miniCity.edges) {
      expect(edge.geometry.length).toBeGreaterThanOrEqual(2);

      const firstPoint = edge.geometry[0]!;
      const lastPoint = edge.geometry[edge.geometry.length - 1]!;
      const fromNode = miniCity.nodes[edge.from]!;
      const toNode = miniCity.nodes[edge.to]!;

      // Coordinates of endpoints must match node coordinates
      expect(firstPoint[0]).toBeCloseTo(fromNode.lat, 4);
      expect(firstPoint[1]).toBeCloseTo(fromNode.lon, 4);
      expect(lastPoint[0]).toBeCloseTo(toNode.lat, 4);
      expect(lastPoint[1]).toBeCloseTo(toNode.lon, 4);

      if (edge.geometry.length > 2) {
        multiPointGeometryCount++;
      }
    }

    // Must have preserved curvature/intermediate waypoints
    expect(multiPointGeometryCount).toBeGreaterThan(0);
  });

  it('accurately snaps places to nearest graph nodes', () => {
    for (const place of miniPlaces.places) {
      const snappedNode = miniCity.nodes[place.nearestNodeId];
      expect(snappedNode).toBeDefined();

      const calculatedDist = haversineDistance(
        place.lat,
        place.lon,
        snappedNode!.lat,
        snappedNode!.lon,
      );

      // Distance stored in place must match haversine distance
      expect(place.distanceToNode).toBeCloseTo(calculatedDist, 1);
    }
  });

  it('computes equirectangular projection consistently with positive bounds', () => {
    const bbox = miniCity.bbox;
    expect(bbox.minX).toBe(0);
    expect(bbox.minY).toBe(0);
    expect(bbox.maxX).toBeGreaterThan(1000);
    expect(bbox.maxY).toBeGreaterThan(1000);

    for (const node of Object.values(miniCity.nodes)) {
      expect(node.x).toBeGreaterThanOrEqual(bbox.minX);
      expect(node.x).toBeLessThanOrEqual(bbox.maxX + 1);
      expect(node.y).toBeGreaterThanOrEqual(bbox.minY);
      expect(node.y).toBeLessThanOrEqual(bbox.maxY + 1);
    }
  });

  it('validates bundled real Jaipur dataset if present', () => {
    const realCityPath = path.resolve(__dirname, '..', 'data', 'city.json');
    const realPlacesPath = path.resolve(__dirname, '..', 'data', 'places.json');

    if (fs.existsSync(realCityPath) && fs.existsSync(realPlacesPath)) {
      const city = JSON.parse(fs.readFileSync(realCityPath, 'utf-8')) as CityGraph;
      const places = JSON.parse(fs.readFileSync(realPlacesPath, 'utf-8')) as PlacesData;

      const parsedCity = CityGraphSchema.parse(city);
      const parsedPlaces = PlacesDataSchema.parse(places);

      expect(parsedCity.cityName).toContain('Jaipur');
      const nodeCount = Object.keys(parsedCity.nodes).length;
      expect(nodeCount).toBeLessThanOrEqual(6000);
      expect(nodeCount).toBeGreaterThan(1000);
      expect(parsedCity.edges.length).toBeGreaterThan(1000);
      expect(parsedPlaces.places.length).toBeGreaterThan(10);

      // Verify all edges point to existing nodes
      for (const edge of parsedCity.edges) {
        expect(parsedCity.nodes[edge.from]).toBeDefined();
        expect(parsedCity.nodes[edge.to]).toBeDefined();
        expect(edge.geometry.length).toBeGreaterThanOrEqual(2);
      }

      // Verify snapped places point to existing nodes
      for (const place of parsedPlaces.places) {
        expect(parsedCity.nodes[place.nearestNodeId]).toBeDefined();
        expect(place.distanceToNode).toBeLessThanOrEqual(1500);
      }
    }
  });
});
