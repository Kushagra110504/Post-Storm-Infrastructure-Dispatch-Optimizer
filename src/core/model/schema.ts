import { z } from 'zod';

export const NodeSchema = z.object({
  id: z.string(),
  lat: z.number(),
  lon: z.number(),
  x: z.number(),
  y: z.number(),
});

export type CityNode = z.infer<typeof NodeSchema>;

export const EdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  length: z.number(), // in meters
  speed: z.number(), // in km/h
  name: z.string(),
  geometry: z.array(z.tuple([z.number(), z.number()])), // array of [lat, lon]
  oneway: z.boolean(),
  blocked: z.boolean().default(false),
  highwayType: z.string().optional(),
  bridge: z.boolean().optional(),
  tunnel: z.boolean().optional(),
});

export type CityEdge = z.infer<typeof EdgeSchema>;

export const BBoxSchema = z.object({
  minLat: z.number(),
  minLon: z.number(),
  maxLat: z.number(),
  maxLon: z.number(),
  minX: z.number(),
  minY: z.number(),
  maxX: z.number(),
  maxY: z.number(),
});

export type BBox = z.infer<typeof BBoxSchema>;

export const CityGraphSchema = z.object({
  cityName: z.string(),
  bbox: BBoxSchema,
  nodes: z.record(z.string(), NodeSchema),
  edges: z.array(EdgeSchema),
  versionHash: z.string().optional(),
});

export type CityGraph = z.infer<typeof CityGraphSchema>;

export const PlaceTypeSchema = z.enum([
  'hospital',
  'water_facility',
  'power_substation',
  'telecom_mast',
  'fire_station',
  'police',
  'townhall',
]);

export type PlaceType = z.infer<typeof PlaceTypeSchema>;

export const PlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: PlaceTypeSchema,
  lat: z.number(),
  lon: z.number(),
  nearestNodeId: z.string(),
  distanceToNode: z.number(), // in meters
});

export type Place = z.infer<typeof PlaceSchema>;

export const PlacesDataSchema = z.object({
  places: z.array(PlaceSchema),
});

export type PlacesData = z.infer<typeof PlacesDataSchema>;
