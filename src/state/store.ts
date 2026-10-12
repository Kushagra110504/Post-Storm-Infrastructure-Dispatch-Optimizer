import { create } from 'zustand';
import { CityGraph, Place, PlaceType, Scenario } from '../core/model/schema';
import { SpatialIndex } from '../core/graph/spatialIndex';
import { generateScenario } from '../core/scenario/generator';

export interface AppState {
  // Map data
  graph: CityGraph | null;
  places: Place[];
  spatialIndex: SpatialIndex | null;
  isMapLoaded: boolean;

  // Scenario
  scenario: Scenario | null;
  scenarioSeed: number;

  // Road network state
  blockedEdgeIds: Set<string>;

  // Selection & interaction
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedIncidentId: string | null;
  selectedFacilityId: string | null;
  selectedTeamId: string | null;
  hoveredPlaceId: string | null;
  filterPlaceType: PlaceType | 'all';

  // Actions
  initMapData: (graph: CityGraph, places: Place[], spatialIndex: SpatialIndex) => void;
  loadScenario: (scenario: Scenario) => void;
  generateAndLoadScenario: (seed?: number) => void;
  toggleEdgeBlock: (edgeId: string) => void;
  setEdgeBlocked: (edgeId: string, blocked: boolean) => void;
  clearBlockedEdges: () => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  selectIncident: (incidentId: string | null) => void;
  selectFacility: (facilityId: string | null) => void;
  selectTeam: (teamId: string | null) => void;
  setHoveredPlace: (placeId: string | null) => void;
  setFilterPlaceType: (type: PlaceType | 'all') => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  graph: null,
  places: [],
  spatialIndex: null,
  isMapLoaded: false,

  scenario: null,
  scenarioSeed: 42,

  blockedEdgeIds: new Set<string>(),

  selectedNodeId: null,
  selectedEdgeId: null,
  selectedIncidentId: null,
  selectedFacilityId: null,
  selectedTeamId: null,
  hoveredPlaceId: null,
  filterPlaceType: 'all',

  initMapData: (graph, places, spatialIndex) => {
    // Generate default scenario on initialization
    let scenario: Scenario | null = null;
    const initialBlockedEdges = new Set<string>();

    try {
      scenario = generateScenario(graph, places, { seed: 42 });
      for (const inc of scenario.incidents) {
        if (inc.blockedEdgeId) {
          initialBlockedEdges.add(inc.blockedEdgeId);
        }
      }
    } catch (e) {
      console.warn('Failed to generate initial scenario:', e);
    }

    set({
      graph,
      places,
      spatialIndex,
      isMapLoaded: true,
      scenario,
      blockedEdgeIds: initialBlockedEdges,
    });
  },

  loadScenario: (scenario) => {
    const blocked = new Set<string>();
    for (const inc of scenario.incidents) {
      if (inc.blockedEdgeId) {
        blocked.add(inc.blockedEdgeId);
      }
    }
    set({
      scenario,
      scenarioSeed: scenario.seed,
      blockedEdgeIds: blocked,
      selectedIncidentId: null,
      selectedFacilityId: null,
      selectedTeamId: null,
    });
  },

  generateAndLoadScenario: (seed) => {
    const { graph, places } = get();
    if (!graph || places.length === 0) return;
    const s = seed ?? get().scenarioSeed;
    const newScenario = generateScenario(graph, places, { seed: s });
    get().loadScenario(newScenario);
  },

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
  selectIncident: (incidentId) => set({ selectedIncidentId: incidentId }),
  selectFacility: (facilityId) => set({ selectedFacilityId: facilityId }),
  selectTeam: (teamId) => set({ selectedTeamId: teamId }),
  setHoveredPlace: (placeId) => set({ hoveredPlaceId: placeId }),
  setFilterPlaceType: (type) => set({ filterPlaceType: type }),
}));
