import { CityGraph, CityGraphSchema, Place, PlacesData, PlacesDataSchema } from '../core/model/schema';
import { SpatialIndex } from '../core/graph/spatialIndex';

// Static imports — bundled into the app, zero runtime network calls
import rawCityData from '../../data/city.json';
import rawPlacesData from '../../data/places.json';

export interface LoadedMapData {
  graph: CityGraph;
  places: Place[];
  placesData: PlacesData;
  spatialIndex: SpatialIndex;
}

let _cached: LoadedMapData | null = null;

/**
 * Loads and validates city graph and places from bundled JSON.
 * Result is cached — safe to call on every render.
 */
export function getMapData(): LoadedMapData {
  if (_cached) return _cached;

  const graph = CityGraphSchema.parse(rawCityData);
  const placesData = PlacesDataSchema.parse(rawPlacesData);
  const spatialIndex = new SpatialIndex(graph, 50);

  _cached = {
    graph,
    places: placesData.places,
    placesData,
    spatialIndex,
  };
  return _cached;
}
