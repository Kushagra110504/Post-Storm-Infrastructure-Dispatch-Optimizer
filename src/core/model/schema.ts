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

// ─── Domain & Scenario Schemas (Phase 3) ────────────────────────────────────

export const SkillSchema = z.enum([
  'high-voltage',
  'pipe-repair',
  'telecom-fiber',
  'debris-clearance',
]);

export type Skill = z.infer<typeof SkillSchema>;

export const VehicleTypeSchema = z.enum([
  'bucket-truck',
  'pump-van',
  'comms-van',
  'heavy-clearance',
]);

export type VehicleType = z.infer<typeof VehicleTypeSchema>;

export const EquipmentSchema = z.enum([
  'generator',
  'excavator',
  'splicer',
  'chainsaw',
]);

export type Equipment = z.infer<typeof EquipmentSchema>;

export const IncidentTypeSchema = z.enum([
  'power',
  'water',
  'comms',
  'road',
]);

export type IncidentType = z.infer<typeof IncidentTypeSchema>;

export const IncidentSchema = z.object({
  id: z.string(),
  type: IncidentTypeSchema,
  node: z.string(),
  placeName: z.string(),
  severity: z.number().int().min(1).max(5),
  requiredSkill: SkillSchema,
  requiredEquipment: EquipmentSchema,
  baseRepairTime: z.number().positive(), // in minutes
  affectedFacilityIds: z.array(z.string()),
  blockedEdgeId: z.string().optional(),
  dependsOn: z.string().optional(),
  reportedAt: z.number().nonnegative().default(0), // minutes from start
});

export type Incident = z.infer<typeof IncidentSchema>;

export const TeamStatusSchema = z.enum([
  'idle',
  'en-route',
  'repairing',
  'completed',
]);

export type TeamStatus = z.infer<typeof TeamStatusSchema>;

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  depotNode: z.string(),
  currentNode: z.string(),
  skills: z.array(SkillSchema),
  vehicleType: VehicleTypeSchema,
  equipment: z.array(EquipmentSchema),
  speedFactor: z.number().positive().default(1.0),
  availableAt: z.number().nonnegative().default(0),
  status: TeamStatusSchema.default('idle'),
});

export type Team = z.infer<typeof TeamSchema>;

export const CriticalFacilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: PlaceTypeSchema,
  node: z.string(),
  criticalityWeight: z.number().positive(),
  incidentIds: z.array(z.string()),
});

export type CriticalFacility = z.infer<typeof CriticalFacilitySchema>;

export const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  cityName: z.string(),
  cityVersionHash: z.string(),
  facilities: z.array(CriticalFacilitySchema),
  incidents: z.array(IncidentSchema),
  teams: z.array(TeamSchema),
  seed: z.number(),
  createdAt: z.string(),
  operationalNotice: z.string(),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
