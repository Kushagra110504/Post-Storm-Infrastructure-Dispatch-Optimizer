import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getMapData } from './data/loader';
import { useAppStore } from './state/store';
import { MapRenderer, PLACE_CONFIG } from './ui/MapRenderer';
import { PlaceType } from './core/model/schema';

export const App: React.FC = () => {
  const {
    graph,
    places,
    spatialIndex,
    isMapLoaded,
    blockedEdgeIds,
    selectedNodeId,
    selectedEdgeId,
    filterPlaceType,
    initMapData,
    toggleEdgeBlock,
    clearBlockedEdges,
    selectNode,
    selectEdge,
    setFilterPlaceType,
  } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 920, height: 650 });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Initialize map data once on mount
  useEffect(() => {
    try {
      const data = getMapData();
      initMapData(data.graph, data.places, data.spatialIndex);
    } catch (err) {
      console.error('Failed to load map data:', err);
    }
  }, [initMapData]);

  // Responsive map size measurement
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setMapSize({
          width: Math.max(clientWidth, 400),
          height: Math.max(clientHeight, 400),
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Selected road details
  const selectedEdge = useMemo(() => {
    if (!graph || !selectedEdgeId) return null;
    return graph.edges.find(e => e.id === selectedEdgeId) ?? null;
  }, [graph, selectedEdgeId]);

  // Selected facility details
  const selectedPlace = useMemo(() => {
    if (!selectedNodeId) return null;
    return places.find(p => p.nearestNodeId === selectedNodeId) ?? null;
  }, [places, selectedNodeId]);

  // Handle road toggle with user feedback
  const handleToggleEdge = (edgeId: string) => {
    toggleEdgeBlock(edgeId);
    selectEdge(edgeId);
    const wasBlocked = blockedEdgeIds.has(edgeId);
    const edge = graph?.edges.find(e => e.id === edgeId);
    const name = edge?.name ? `"${edge.name}"` : `ID ${edgeId}`;
    setStatusMessage(wasBlocked ? `Road ${name} unblocked (reopened)` : `Road ${name} BLOCKED (closed)`);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Quick arterial block demo helper
  const handleBlockKeyArterial = () => {
    if (!graph) return;
    // Find a primary or trunk road with a real name
    const primaryEdge = graph.edges.find(
      e => (e.highwayType === 'primary' || e.highwayType === 'trunk') && e.name.length > 2 && !blockedEdgeIds.has(e.id)
    );
    if (primaryEdge) {
      handleToggleEdge(primaryEdge.id);
    }
  };

  const placeTypes: Array<PlaceType | 'all'> = [
    'all',
    'hospital',
    'power_substation',
    'water_facility',
    'police',
    'fire_station',
    'telecom_mast',
    'townhall',
  ];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-group">
          <h1>GridRescue</h1>
          <span className="badge-phase">Phase 2: Offline Map Engine</span>
          <span className="badge-sim">Jaipur, RJ &bull; OSM Real Network</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {statusMessage && (
            <span
              style={{
                fontSize: '0.8rem',
                color: '#facc15',
                background: 'rgba(250, 204, 21, 0.1)',
                padding: '0.2rem 0.6rem',
                borderRadius: '4px',
                border: '1px solid rgba(250, 204, 21, 0.25)',
              }}
            >
              {statusMessage}
            </span>
          )}
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Blocked Roads: <strong style={{ color: blockedEdgeIds.size > 0 ? '#ef4444' : '#10b981' }}>{blockedEdgeIds.size}</strong>
          </span>
          {blockedEdgeIds.size > 0 && (
            <button
              onClick={clearBlockedEdges}
              className="btn-action btn-danger"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
            >
              Clear All Blocked
            </button>
          )}
        </div>
      </header>

      {/* Main Layout */}
      <main className="app-main">
        <div className="control-room-layout">
          {/* Map Container */}
          <div className="map-wrapper" ref={containerRef}>
            {isMapLoaded && graph && spatialIndex ? (
              <MapRenderer
                graph={graph}
                places={places}
                spatialIndex={spatialIndex}
                blockedEdgeIds={blockedEdgeIds}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                filterPlaceType={filterPlaceType}
                onNodeClick={(id) => selectNode(id)}
                onEdgeClick={(edge) => selectEdge(edge.id)}
                onEdgeToggle={handleToggleEdge}
                onPlaceClick={(place) => selectNode(place.nearestNodeId)}
                width={mapSize.width}
                height={mapSize.height}
              />
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Loading offline city graph...
              </div>
            )}
          </div>

          {/* Right Sidebar: Control-Room Inspector */}
          <aside className="sidebar-panel">
            {/* Facility Filter Card */}
            <div className="card">
              <div className="card-title">
                <span>Facility Layers</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {places.length} Total
                </span>
              </div>
              <div className="pill-grid">
                {placeTypes.map((pt) => {
                  const count = pt === 'all' ? places.length : places.filter(p => p.type === pt).length;
                  const label = pt === 'all' ? 'All' : PLACE_CONFIG[pt]?.label ?? pt;
                  const icon = pt === 'all' ? '📍' : PLACE_CONFIG[pt]?.icon ?? '';
                  return (
                    <button
                      key={pt}
                      className={`pill-btn ${filterPlaceType === pt ? 'active' : ''}`}
                      onClick={() => setFilterPlaceType(pt)}
                    >
                      <span>{icon}</span>
                      <span>{label}</span>
                      <span style={{ opacity: 0.6 }}>({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Road Network & Blocking Inspector Card */}
            <div className="card">
              <div className="card-title">
                <span>Road Network Inspector</span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.15rem 0.4rem',
                    borderRadius: '4px',
                    background: selectedEdge ? (blockedEdgeIds.has(selectedEdge.id) ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)') : '#1e293b',
                    color: selectedEdge ? (blockedEdgeIds.has(selectedEdge.id) ? '#ef4444' : '#10b981') : '#94a3b8',
                  }}
                >
                  {selectedEdge ? (blockedEdgeIds.has(selectedEdge.id) ? 'BLOCKED' : 'CLEAR') : 'SELECT ROAD'}
                </span>
              </div>

              {selectedEdge ? (
                <div>
                  <div className="data-row">
                    <span className="data-label">Road Name</span>
                    <span className="data-value" style={{ color: '#38bdf8' }}>
                      {selectedEdge.name || 'Unnamed Segment'}
                    </span>
                  </div>
                  <div className="data-row">
                    <span className="data-label">Highway Class</span>
                    <span className="data-value">{selectedEdge.highwayType ?? 'unclassified'}</span>
                  </div>
                  <div className="data-row">
                    <span className="data-label">Segment Length</span>
                    <span className="data-value">{Math.round(selectedEdge.length)} m</span>
                  </div>
                  <div className="data-row">
                    <span className="data-label">Design Speed</span>
                    <span className="data-value">{selectedEdge.speed} km/h</span>
                  </div>
                  <div className="data-row">
                    <span className="data-label">Edge ID</span>
                    <span className="data-value" style={{ fontSize: '0.7rem' }}>
                      {selectedEdge.id}
                    </span>
                  </div>

                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleToggleEdge(selectedEdge.id)}
                      className={`btn-action ${blockedEdgeIds.has(selectedEdge.id) ? 'btn-danger' : ''}`}
                      style={{ flex: 1 }}
                    >
                      {blockedEdgeIds.has(selectedEdge.id) ? '⛔ Unblock Road' : '🚧 Block Road'}
                    </button>
                    <button
                      onClick={() => selectEdge(null)}
                      className="btn-action btn-secondary"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <p>Click any road on the map to inspect or toggle road closure.</p>
                  <div style={{ marginTop: '0.6rem' }}>
                    <button
                      onClick={handleBlockKeyArterial}
                      className="btn-action btn-secondary"
                      style={{ width: '100%', fontSize: '0.75rem' }}
                    >
                      🚧 Test: Block Major Arterial
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Facility / Node Selection Card */}
            {(selectedPlace || selectedNodeId) && (
              <div className="card">
                <div className="card-title">
                  <span>{selectedPlace ? 'Selected Facility' : 'Junction Node'}</span>
                  {selectedPlace && <span>{PLACE_CONFIG[selectedPlace.type]?.icon}</span>}
                </div>
                {selectedPlace ? (
                  <div>
                    <div className="data-row">
                      <span className="data-label">Facility Name</span>
                      <span className="data-value" style={{ color: '#f8fafc' }}>{selectedPlace.name}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Type</span>
                      <span className="data-value">{PLACE_CONFIG[selectedPlace.type]?.label}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Snapped Node</span>
                      <span className="data-value" style={{ fontSize: '0.75rem' }}>{selectedPlace.nearestNodeId}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Offset Distance</span>
                      <span className="data-value">{Math.round(selectedPlace.distanceToNode)} m</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="data-row">
                      <span className="data-label">Node ID</span>
                      <span className="data-value" style={{ fontSize: '0.75rem' }}>{selectedNodeId}</span>
                    </div>
                    {graph?.nodes[selectedNodeId!] && (
                      <>
                        <div className="data-row">
                          <span className="data-label">Coordinates</span>
                          <span className="data-value">
                            {graph.nodes[selectedNodeId!]?.lat.toFixed(5)}, {graph.nodes[selectedNodeId!]?.lon.toFixed(5)}
                          </span>
                        </div>
                        <div className="data-row">
                          <span className="data-label">Metric (X, Y)</span>
                          <span className="data-value">
                            {Math.round(graph.nodes[selectedNodeId!]?.x ?? 0)}m, {Math.round(graph.nodes[selectedNodeId!]?.y ?? 0)}m
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <button
                  onClick={() => selectNode(null)}
                  className="btn-action btn-secondary"
                  style={{ width: '100%', marginTop: '0.6rem', fontSize: '0.75rem' }}
                >
                  Clear Selection
                </button>
              </div>
            )}

            {/* Quick Controls & Stats Card */}
            <div className="card">
              <div className="card-title">
                <span>Network Statistics</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)' }}>● ONLINE</span>
              </div>
              <div className="data-row">
                <span className="data-label">Intersection Junctions</span>
                <span className="data-value">{graph ? Object.keys(graph.nodes).length.toLocaleString() : '—'}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Contracted Road Edges</span>
                <span className="data-value">{graph ? graph.edges.length.toLocaleString() : '—'}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Coverage Bounding Box</span>
                <span className="data-value">
                  {graph ? `${Math.round(graph.bbox.maxX / 1000)} x ${Math.round(graph.bbox.maxY / 1000)} km` : '—'}
                </span>
              </div>
              <div className="data-row">
                <span className="data-label">Rendering Pipeline</span>
                <span className="data-value" style={{ color: '#10b981' }}>SVG / 60 FPS GPU</span>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div>
          GridRescue &bull; Phase 2 Offline Map Renderer &bull; Jaipur Infrastructure Control Room
        </div>
        <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)' }}>
          <span>Pan: Drag / Arrows</span>
          <span>Zoom: Wheel / +/-</span>
          <span>Reset: 0</span>
          <span>&copy; OpenStreetMap contributors (ODbL)</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
