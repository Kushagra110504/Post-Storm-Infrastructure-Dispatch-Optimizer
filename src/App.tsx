import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getMapData } from './data/loader';
import { useAppStore } from './state/store';
import { MapRenderer, INCIDENT_CONFIG } from './ui/MapRenderer';
import { exportScenario, importScenario } from './core/scenario/io';

export const App: React.FC = () => {
  const {
    graph,
    places,
    spatialIndex,
    isMapLoaded,
    scenario,
    scenarioSeed,
    blockedEdgeIds,
    selectedNodeId,
    selectedEdgeId,
    selectedIncidentId,
    selectedFacilityId,
    selectedTeamId,
    filterPlaceType,
    initMapData,
    generateAndLoadScenario,
    loadScenario,
    toggleEdgeBlock,
    clearBlockedEdges,
    selectNode,
    selectEdge,
    selectIncident,
    selectFacility,
    selectTeam,
  } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 920, height: 650 });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [inputSeed, setInputSeed] = useState<string>('42');
  const [activeTab, setActiveTab] = useState<'incidents' | 'facilities' | 'teams' | 'roads'>('incidents');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

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

  // Selected scenario incident
  const currentIncident = useMemo(() => {
    if (!scenario || !selectedIncidentId) return null;
    return scenario.incidents.find(i => i.id === selectedIncidentId) ?? null;
  }, [scenario, selectedIncidentId]);

  // Selected critical facility
  const currentFacility = useMemo(() => {
    if (!scenario || !selectedFacilityId) return null;
    return scenario.facilities.find(f => f.id === selectedFacilityId) ?? null;
  }, [scenario, selectedFacilityId]);

  // Selected team
  const currentTeam = useMemo(() => {
    if (!scenario || !selectedTeamId) return null;
    return scenario.teams.find(t => t.id === selectedTeamId) ?? null;
  }, [scenario, selectedTeamId]);

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

  // Seed regeneration handler
  const handleRegenerate = (seedValue: number) => {
    setInputSeed(String(seedValue));
    generateAndLoadScenario(seedValue);
    setStatusMessage(`Generated 12/8/5 Jaipur Scenario with Seed ${seedValue}`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Export scenario JSON
  const handleExportJson = () => {
    if (!scenario) return;
    try {
      const json = exportScenario(scenario);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scenario-jaipur-seed-${scenario.seed}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage('Scenario exported to JSON file');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  // Import scenario JSON
  const handleImportJson = () => {
    if (!graph || !importText.trim()) return;
    try {
      setImportError(null);
      const imported = importScenario(importText, graph);
      loadScenario(imported);
      setImportModalOpen(false);
      setImportText('');
      setStatusMessage(`Imported scenario: "${imported.name}"`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };


  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-group">
          <h1>GridRescue</h1>
          <span className="badge-phase">Phase 3: Domain & Scenario Engine</span>
          <span className="badge-sim">Jaipur, RJ &bull; Real OSM Road Network</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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

          {/* Seed Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#1e293b', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid #334155' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Seed:</span>
            <input
              type="number"
              value={inputSeed}
              onChange={(e) => setInputSeed(e.target.value)}
              style={{ width: '45px', background: '#0f172a', border: '1px solid #475569', color: '#f8fafc', padding: '0.1rem 0.3rem', fontSize: '0.75rem', borderRadius: '2px' }}
            />
            <button
              onClick={() => handleRegenerate(parseInt(inputSeed, 10) || 42)}
              className="btn-action"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
            >
              Generate
            </button>
          </div>

          {/* Preset Seeds */}
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {[42, 108, 999].map(s => (
              <button
                key={s}
                onClick={() => handleRegenerate(s)}
                className={`pill-btn ${scenarioSeed === s ? 'active' : ''}`}
                style={{ padding: '0.2rem 0.45rem', fontSize: '0.7rem' }}
              >
                #{s}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportJson}
            className="btn-action btn-secondary"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            title="Export scenario as validated JSON"
          >
            Export JSON
          </button>
          <button
            onClick={() => { setImportModalOpen(true); setImportError(null); }}
            className="btn-action btn-secondary"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            title="Import custom scenario JSON"
          >
            Import JSON
          </button>
        </div>
      </header>

      {/* Operational Notice Banner */}
      <div
        style={{
          background: 'rgba(245, 158, 11, 0.1)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
          padding: '0.35rem 1.5rem',
          fontSize: '0.75rem',
          color: '#fbbf24',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          <strong>Operational Notice:</strong> Real map (OpenStreetMap), simulated incidents. Not actual infrastructure data.
        </span>
        <span>
          Scenario: <strong>{scenario?.name ?? 'Loading...'}</strong> (12 Incidents &bull; 8 Crews &bull; 5 Critical Facilities)
        </span>
      </div>

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
                incidents={scenario?.incidents ?? []}
                teams={scenario?.teams ?? []}
                blockedEdgeIds={blockedEdgeIds}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                selectedIncidentId={selectedIncidentId}
                selectedTeamId={selectedTeamId}
                filterPlaceType={filterPlaceType}
                onNodeClick={(id) => selectNode(id)}
                onEdgeClick={(edge) => selectEdge(edge.id)}
                onEdgeToggle={handleToggleEdge}
                onPlaceClick={(place) => selectNode(place.nearestNodeId)}
                onIncidentClick={(inc) => {
                  selectIncident(inc.id);
                  selectNode(inc.node);
                  setActiveTab('incidents');
                }}
                onTeamClick={(team) => {
                  selectTeam(team.id);
                  selectNode(team.depotNode);
                  setActiveTab('teams');
                }}
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
            {/* Inspector Navigation Tabs */}
            <div style={{ display: 'flex', gap: '0.3rem', background: '#0f172a', padding: '0.3rem', borderRadius: '6px', border: '1px solid #1e293b' }}>
              <button
                onClick={() => setActiveTab('incidents')}
                className={`pill-btn ${activeTab === 'incidents' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Incidents ({scenario?.incidents.length ?? 0})
              </button>
              <button
                onClick={() => setActiveTab('facilities')}
                className={`pill-btn ${activeTab === 'facilities' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Facilities ({scenario?.facilities.length ?? 0})
              </button>
              <button
                onClick={() => setActiveTab('teams')}
                className={`pill-btn ${activeTab === 'teams' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Crews ({scenario?.teams.length ?? 0})
              </button>
              <button
                onClick={() => setActiveTab('roads')}
                className={`pill-btn ${activeTab === 'roads' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Roads ({blockedEdgeIds.size})
              </button>
            </div>

            {/* TAB: Incidents */}
            {activeTab === 'incidents' && (
              <div className="card" style={{ flex: 1, overflowY: 'auto', maxHeight: '560px' }}>
                <div className="card-title">
                  <span>Simulated Incidents (12)</span>
                  <span style={{ fontSize: '0.7rem', color: '#ef4444' }}>PRIORITY QUEUE</span>
                </div>

                {currentIncident && (
                  <div style={{ background: '#1e293b', padding: '0.75rem', borderRadius: '6px', marginBottom: '0.75rem', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem' }}>
                        {currentIncident.placeName}
                      </span>
                      <span style={{ background: '#ef4444', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>
                        SEVERITY {currentIncident.severity}
                      </span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Incident Type</span>
                      <span className="data-value">{INCIDENT_CONFIG[currentIncident.type]?.label}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Required Skill</span>
                      <span className="data-value">{currentIncident.requiredSkill}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Required Equipment</span>
                      <span className="data-value">{currentIncident.requiredEquipment}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Repair Duration</span>
                      <span className="data-value">{currentIncident.baseRepairTime} min</span>
                    </div>
                    {currentIncident.dependsOn && (
                      <div className="data-row">
                        <span className="data-label">Depends On</span>
                        <span className="data-value" style={{ color: '#f59e0b' }}>{currentIncident.dependsOn} (MUST FIX FIRST)</span>
                      </div>
                    )}
                    {currentIncident.blockedEdgeId && (
                      <div className="data-row">
                        <span className="data-label">Blocks Road Edge</span>
                        <span className="data-value" style={{ color: '#ef4444' }}>{currentIncident.blockedEdgeId}</span>
                      </div>
                    )}
                    {currentIncident.affectedFacilityIds.length > 0 && (
                      <div className="data-row">
                        <span className="data-label">Degrades Facility</span>
                        <span className="data-value" style={{ color: '#f43f5e' }}>{currentIncident.affectedFacilityIds.join(', ')}</span>
                      </div>
                    )}
                    <button
                      onClick={() => selectIncident(null)}
                      className="btn-action btn-secondary"
                      style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.75rem' }}
                    >
                      Deselect Incident
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {scenario?.incidents.map((inc) => {
                    const conf = INCIDENT_CONFIG[inc.type] ?? { icon: '⚠️', color: '#ef4444', label: inc.type };
                    const isSelected = selectedIncidentId === inc.id;
                    return (
                      <div
                        key={inc.id}
                        onClick={() => {
                          selectIncident(inc.id);
                          selectNode(inc.node);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.45rem 0.6rem',
                          background: isSelected ? 'rgba(56, 189, 248, 0.15)' : '#0f172a',
                          border: isSelected ? '1px solid #38bdf8' : '1px solid #1e293b',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.9rem' }}>{conf.icon}</span>
                          <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                              {inc.placeName}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                              {conf.label} &bull; {inc.baseRepairTime}m &bull; {inc.requiredSkill}
                              {inc.dependsOn ? ' &bull; ⚠️ DEPENDENCY' : ''}
                              {inc.blockedEdgeId ? ' &bull; ⛔ BLOCKS ROAD' : ''}
                            </div>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.35rem',
                            borderRadius: '3px',
                            background: inc.severity >= 4 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                            color: inc.severity >= 4 ? '#ef4444' : '#f59e0b',
                          }}
                        >
                          S{inc.severity}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: Critical Facilities */}
            {activeTab === 'facilities' && (
              <div className="card" style={{ flex: 1, overflowY: 'auto' }}>
                <div className="card-title">
                  <span>Critical Facilities (5)</span>
                  <span style={{ fontSize: '0.7rem', color: '#10b981' }}>PROTECTION TARGETS</span>
                </div>

                {currentFacility && (
                  <div style={{ background: '#1e293b', padding: '0.75rem', borderRadius: '6px', marginBottom: '0.75rem', border: '1px solid #334155' }}>
                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                      {currentFacility.name}
                    </div>
                    <div className="data-row">
                      <span className="data-label">Criticality Weight</span>
                      <span className="data-value">{currentFacility.criticalityWeight}x</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Associated Incidents</span>
                      <span className="data-value" style={{ color: currentFacility.incidentIds.length > 0 ? '#ef4444' : '#10b981' }}>
                        {currentFacility.incidentIds.length > 0 ? currentFacility.incidentIds.join(', ') : 'None (Fully Powered)'}
                      </span>
                    </div>
                    <button
                      onClick={() => selectFacility(null)}
                      className="btn-action btn-secondary"
                      style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.75rem' }}
                    >
                      Deselect Facility
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {scenario?.facilities.map(fac => {
                    const isSelected = selectedFacilityId === fac.id;
                    const isDegraded = fac.incidentIds.length > 0;
                    return (
                      <div
                        key={fac.id}
                        onClick={() => {
                          selectFacility(fac.id);
                          selectNode(fac.node);
                        }}
                        style={{
                          padding: '0.6rem',
                          background: isSelected ? 'rgba(56, 189, 248, 0.15)' : '#0f172a',
                          border: isSelected ? '1px solid #38bdf8' : '1px solid #1e293b',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.825rem', color: '#f8fafc' }}>
                            {fac.name}
                          </span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                              background: isDegraded ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                              color: isDegraded ? '#ef4444' : '#10b981',
                              fontWeight: 600,
                            }}
                          >
                            {isDegraded ? `DEGRADED (${fac.incidentIds.length})` : 'OPERATIONAL'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                          Type: {fac.type} &bull; Criticality Weight: {fac.criticalityWeight}x
                        </div>
                        {isDegraded && (
                          <div style={{ fontSize: '0.7rem', color: '#fb7185', marginTop: '0.25rem' }}>
                            Impacted by incidents: {fac.incidentIds.join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: Teams */}
            {activeTab === 'teams' && (
              <div className="card" style={{ flex: 1, overflowY: 'auto' }}>
                <div className="card-title">
                  <span>Dispatch Crews (8)</span>
                  <span style={{ fontSize: '0.7rem', color: '#0284c7' }}>SPECIALIZED UNITS</span>
                </div>

                {currentTeam && (
                  <div style={{ background: '#1e293b', padding: '0.75rem', borderRadius: '6px', marginBottom: '0.75rem', border: '1px solid #334155' }}>
                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                      {currentTeam.name}
                    </div>
                    <div className="data-row">
                      <span className="data-label">Vehicle Type</span>
                      <span className="data-value">{currentTeam.vehicleType}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Skills</span>
                      <span className="data-value">{currentTeam.skills.join(', ')}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Equipment</span>
                      <span className="data-value">{currentTeam.equipment.join(', ')}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Status</span>
                      <span className="data-value" style={{ color: '#38bdf8' }}>{currentTeam.status}</span>
                    </div>
                    <button
                      onClick={() => selectTeam(null)}
                      className="btn-action btn-secondary"
                      style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.75rem' }}
                    >
                      Deselect Crew
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {scenario?.teams.map(t => {
                    const isSelected = selectedTeamId === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          selectTeam(t.id);
                          selectNode(t.depotNode);
                        }}
                        style={{
                          padding: '0.5rem 0.65rem',
                          background: isSelected ? 'rgba(56, 189, 248, 0.15)' : '#0f172a',
                          border: isSelected ? '1px solid #38bdf8' : '1px solid #1e293b',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.825rem', color: '#f8fafc' }}>
                            {t.name}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                            {t.vehicleType}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                          Skill: {t.skills.join(', ')} &bull; Gear: {t.equipment.join(', ')}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          Depot: {t.depotNode} &bull; Status: {t.status}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: Roads & Blocking */}
            {activeTab === 'roads' && (
              <div className="card" style={{ flex: 1 }}>
                <div className="card-title">
                  <span>Road Blockage Manager</span>
                  <span style={{ fontSize: '0.7rem', color: blockedEdgeIds.size > 0 ? '#ef4444' : '#10b981' }}>
                    {blockedEdgeIds.size} BLOCKED
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
                      <span className="data-label">Length</span>
                      <span className="data-value">{Math.round(selectedEdge.length)} m</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Status</span>
                      <span className="data-value" style={{ color: blockedEdgeIds.has(selectedEdge.id) ? '#ef4444' : '#10b981' }}>
                        {blockedEdgeIds.has(selectedEdge.id) ? 'BLOCKED' : 'CLEAR'}
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
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <p>Click any road on the map to inspect or toggle blockage.</p>
                    {blockedEdgeIds.size > 0 && (
                      <div style={{ marginTop: '1rem' }}>
                        <button
                          onClick={clearBlockedEdges}
                          className="btn-action btn-danger"
                          style={{ width: '100%' }}
                        >
                          Clear All ({blockedEdgeIds.size}) Blocked Roads
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </main>

      {/* Import Scenario Modal */}
      {importModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '1.25rem',
              width: '90%',
              maxWidth: '560px',
            }}
          >
            <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: '0.5rem' }}>
              Import Scenario JSON
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
              Paste validated scenario JSON below (enforces 1MB limit, Zod validation, and map node checks).
            </p>
            {importError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444',
                  color: '#f87171',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  marginBottom: '0.75rem',
                }}
              >
                {importError}
              </div>
            )}
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste Scenario JSON..."
              rows={8}
              style={{
                width: '100%',
                background: '#020617',
                border: '1px solid #334155',
                borderRadius: '4px',
                color: '#f8fafc',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                padding: '0.5rem',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                onClick={() => setImportModalOpen(false)}
                className="btn-action btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleImportJson}
                className="btn-action"
              >
                Validate & Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <div>
          GridRescue &bull; Phase 3 Domain & Scenario Engine &bull; Jaipur Infrastructure Control Room
        </div>
        <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)' }}>
          <span>12 Incidents (4 Power, 3 Water, 2 Comms, 3 Road)</span>
          <span>8 Specialized Crews</span>
          <span>5 Critical Facilities</span>
          <span>&copy; OpenStreetMap contributors (ODbL)</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
