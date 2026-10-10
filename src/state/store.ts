import { create } from 'zustand';
import { CityGraph, Place, PlaceType } from '../core/model/schema';
import { SpatialIndex } from '../core/graph/spatialIndex';

export interface AppState {
  // Map data
  graph: CityGraph | null;
  places: Place[];
  spatialIndex: SpatialIndex | null;
  isMapLoaded: boolean;

  // Road network state
  blockedEdgeIds: Set<string>;

  // Selection & interaction
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  hoveredPlaceId: string | null;
  filterPlaceType: PlaceType | 'all';

  // Actions
  initMapData: (graph: CityGraph, places: Place[], spatialIndex: SpatialIndex) => void;
  toggleEdgeBlock: (edgeId: string) => void;
  setEdgeBlocked: (edgeId: string, blocked: boolean) => void;
  clearBlockedEdges: () => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  setHoveredPlace: (placeId: string | null) => void;
  setFilterPlaceType: (type: PlaceType | 'all') => void;
}

export const useAppStore = create<AppState>((set) => ({
  graph: null,
  places: [],
  spatialIndex: null,
  isMapLoaded: false,

  blockedEdgeIds: new Set<string>(),

  selectedNodeId: null,
  selectedEdgeId: null,
  hoveredPlaceId: null,
  filterPlaceType: 'all',

  initMapData: (graph, places, spatialIndex) =>
    set({
      graph,
      places,
      spatialIndex,
      isMapLoaded: true,
    }),

  toggleEdgeBlock: (edgeId) =>
    set((state) => {
      const next = new Set(state.blockedEdgeIds);
      if (next.has(edgeId)) {
        next.delete(edgeId);
      } else {
        next.add(edgeId);
      }
      return { blockedEdgeIds: next };
    }),

  setEdgeBlocked: (edgeId, blocked) =>
    set((state) => {
      const next = new Set(state.blockedEdgeIds);
      if (blocked) {
        next.add(edgeId);
      } else {
        next.delete(edgeId);
      }
      return { blockedEdgeIds: next };
    }),

  clearBlockedEdges: () =>
    set({
      blockedEdgeIds: new Set<string>(),
    }),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId }),
  setHoveredPlace: (placeId) => set({ hoveredPlaceId: placeId }),
  setFilterPlaceType: (type) => set({ filterPlaceType: type }),
}));
