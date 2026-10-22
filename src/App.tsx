import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getMapData } from './data/loader';
import { useAppStore } from './state/store';
import { MapRenderer, INCIDENT_CONFIG } from './ui/MapRenderer';
import { nearestFirstBaseline } from './core/baseline/nearestFirst';
import { simulate } from './core/plan/simulator';
import { evaluateCost } from './core/cost/costFunction';
import { computeKPIs, KPIs } from './core/baseline/kpi';
import { RouteCache } from './core/routing/routeCache';
import { SimulationResult, DispatchPlan } from './core/plan/types';
import { OptimizerRunner } from './workers/optimizerClient';
import { HillClimbProgress, HillClimbResult } from './core/hillclimb/hillClimb';

// ─── Strategy definitions ────────────────────────────────────────────────────

type Strategy = 'baseline' | 'hill-climb' | 'random-restart' | 'stochastic';

interface StrategyOption {
  id: Strategy;
  label: string;
  description: string;
  accentColor: string;          // used only for small indicators, no gradients
  maxRestarts: number;
  maxIter: number;
  neighbors: number;
}

const STRATEGIES: StrategyOption[] = [
  {
    id: 'baseline',
    label: 'Baseline (Greedy)',
    description: 'Nearest-first dispatcher. Fast, no optimization.',
    accentColor: '#d97706',
    maxRestarts: 0, maxIter: 0, neighbors: 0,
  },
  {
    id: 'hill-climb',
    label: 'Hill Climbing',
    description: 'Single-start greedy ascent — accepts only improving moves.',
    accentColor: '#2563eb',
    maxRestarts: 1, maxIter: 60, neighbors: 6,
  },
  {
    id: 'random-restart',
    label: 'Random-Restart HC',
    description: 'Hill Climbing from 5 random starting points — escapes local optima.',
    accentColor: '#16a34a',
    maxRestarts: 5, maxIter: 40, neighbors: 6,
  },
  {
    id: 'stochastic',
    label: 'Stochastic HC',
    description: 'Wider neighbour sampling with random restarts.',
    accentColor: '#7c3aed',
    maxRestarts: 5, maxIter: 50, neighbors: 12,
  },
];

// ─── Shared inline-style constants ──────────────────────────────────────────

const S = {
  // surfaces
  surface:  { background: '#ffffff', border: '1px solid #d1d9e0' },
  raised:   { background: '#f9fafb', border: '1px solid #d1d9e0' },
  muted:    { background: '#f1f5f9', border: '1px solid #d1d9e0' },

  // text
  textPrimary:   { color: '#111827' },
  textSecondary: { color: '#4b5563' },
  textMuted:     { color: '#9ca3af' },

  // common radius
  r4: { borderRadius: 4 } as const,
  r6: { borderRadius: 6 } as const,
  r8: { borderRadius: 8 } as const,

  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },

  tagRed:    { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, fontSize: '0.68rem', padding: '0.1rem 0.38rem', fontWeight: 600 },
  tagAmber:  { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: 4, fontSize: '0.68rem', padding: '0.1rem 0.38rem', fontWeight: 600 },
  tagGreen:  { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 4, fontSize: '0.68rem', padding: '0.1rem 0.38rem', fontWeight: 600 },
  tagBlue:   { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 4, fontSize: '0.68rem', padding: '0.1rem 0.38rem', fontWeight: 600 },
  tagPurple: { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 4, fontSize: '0.68rem', padding: '0.1rem 0.38rem', fontWeight: 600 },
};

// ─── App ────────────────────────────────────────────────────────────────────

export const App: React.FC = () => {
  const {
    graph, places, spatialIndex, isMapLoaded,
    scenario, scenarioSeed, blockedEdgeIds,
    selectedNodeId, selectedEdgeId, selectedIncidentId, selectedFacilityId, selectedTeamId,
    filterPlaceType,
    initMapData, generateAndLoadScenario,
    toggleEdgeBlock, clearBlockedEdges,
    selectNode, selectEdge, selectIncident, selectFacility, selectTeam,
  } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 920, height: 650 });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [inputSeed, setInputSeed] = useState<string>('42');
  const [activeTab, setActiveTab] = useState<'incidents' | 'facilities' | 'teams' | 'roads' | 'dispatch'>('incidents');

  // Dropdown-based demo — no modal needed
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy>('hill-climb');

  const [baselineResult, setBaselineResult] = useState<SimulationResult | null>(null);
  const [baselineKPIs, setBaselineKPIs] = useState<KPIs | null>(null);
  const [baselinePlan, setBaselinePlan] = useState<DispatchPlan | null>(null);
  const optimizerRunner = useRef<OptimizerRunner>(new OptimizerRunner());
  const [isRunning, setIsRunning] = useState(false);
  const [optimizerProgress, setOptimizerProgress] = useState<HillClimbProgress | null>(null);
  const [hillClimbResult, setHillClimbResult] = useState<HillClimbResult | null>(null);
  const [hillClimbKPIs, setHillClimbKPIs] = useState<KPIs | null>(null);
  const [activePlanView, setActivePlanView] = useState<'baseline' | 'hillclimb'>('baseline');
  const [activeStrategyLabel, setActiveStrategyLabel] = useState<string>('');

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const data = getMapData();
      initMapData(data.graph, data.places, data.spatialIndex);
    } catch (err) {
      console.error('Failed to load map data:', err);
    }
  }, [initMapData]);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setMapSize({ width: Math.max(clientWidth, 400), height: Math.max(clientHeight, 400) });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Derived selections ────────────────────────────────────────────────────

  const selectedEdge = useMemo(() => {
    if (!graph || !selectedEdgeId) return null;
    return graph.edges.find(e => e.id === selectedEdgeId) ?? null;
  }, [graph, selectedEdgeId]);

  const currentIncident = useMemo(() => {
    if (!scenario || !selectedIncidentId) return null;
    return scenario.incidents.find(i => i.id === selectedIncidentId) ?? null;
  }, [scenario, selectedIncidentId]);

  const currentFacility = useMemo(() => {
    if (!scenario || !selectedFacilityId) return null;
    return scenario.facilities.find(f => f.id === selectedFacilityId) ?? null;
  }, [scenario, selectedFacilityId]);

  const currentTeam = useMemo(() => {
    if (!scenario || !selectedTeamId) return null;
    return scenario.teams.find(t => t.id === selectedTeamId) ?? null;
  }, [scenario, selectedTeamId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const showStatus = (msg: string, ms = 4000) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), ms);
  };

  const handleToggleEdge = (edgeId: string) => {
    toggleEdgeBlock(edgeId);
    selectEdge(edgeId);
    const wasBlocked = blockedEdgeIds.has(edgeId);
    const edge = graph?.edges.find(e => e.id === edgeId);
    const name = edge?.name ? `"${edge.name}"` : `ID ${edgeId}`;
    showStatus(wasBlocked ? `Road ${name} unblocked` : `Road ${name} blocked`);
  };

  const handleRegenerate = (seedValue: number) => {
    setInputSeed(String(seedValue));
    generateAndLoadScenario(seedValue);
    setBaselineResult(null); setBaselineKPIs(null); setBaselinePlan(null);
    setHillClimbResult(null); setHillClimbKPIs(null); setOptimizerProgress(null);
    showStatus(`Scenario #${seedValue} loaded`);
  };

  const handleRunDemo = () => {
    if (!scenario || !graph) return;
    setIsRunning(true);
    setOptimizerProgress(null);
    const strat = STRATEGIES.find(s => s.id === selectedStrategy)!;
    setActiveStrategyLabel(strat.label);

    if (selectedStrategy === 'baseline') {
      try {
        const cache = new RouteCache(graph);
        const plan = nearestFirstBaseline(scenario, graph, cache);
        const sim = simulate(plan, scenario, graph, cache);
        evaluateCost(sim, scenario);
        const kpis = computeKPIs(sim, scenario);
        setBaselineResult(sim); setBaselineKPIs(kpis); setBaselinePlan(plan);
        setHillClimbResult(null); setHillClimbKPIs(null);
        setActivePlanView('baseline');
        showStatus(`Baseline: J=${sim.costJ.toFixed(1)}, ${kpis.resolvedCount}/${scenario.incidents.length} resolved`, 5000);
      } catch (e) { console.error(e); showStatus('Baseline failed'); }
      setIsRunning(false);
      return;
    }

    // Compute baseline first for comparison
    if (!baselineResult) {
      try {
        const cache = new RouteCache(graph);
        const p = nearestFirstBaseline(scenario, graph, cache);
        const bsim = simulate(p, scenario, graph, cache);
        evaluateCost(bsim, scenario);
        setBaselineResult(bsim); setBaselineKPIs(computeKPIs(bsim, scenario)); setBaselinePlan(p);
      } catch (e) { console.warn(e); }
    }

    showStatus(`${strat.label} running…`);
    optimizerRunner.current.start(
      scenario, graph,
      { maxRestarts: strat.maxRestarts, maxIterationsPerRestart: strat.maxIter, neighborsPerStep: strat.neighbors, seed: scenario.seed },
      {
        onProgress: p => setOptimizerProgress(p),
        onDone: result => {
          setIsRunning(false);
          setHillClimbResult(result);
          const kpis = computeKPIs(result.bestSimResult, scenario);
          setHillClimbKPIs(kpis);
          setActivePlanView('hillclimb');
          setActiveTab('dispatch');
          showStatus(`${strat.label}: J=${result.bestCostJ.toFixed(1)} (−${result.improvementPct.toFixed(1)}% vs baseline)`, 6000);
        },
        onError: err => { setIsRunning(false); showStatus(`Error: ${err.message}`); },
      }
    );
  };

  const handleStop = () => {
    optimizerRunner.current.stop();
    setIsRunning(false);
    showStatus('Stopped');
  };

  // ── Active plan & sim ─────────────────────────────────────────────────────

  const activePlan = activePlanView === 'hillclimb' ? (hillClimbResult?.bestPlan ?? null) : baselinePlan;
  const activeSim  = activePlanView === 'hillclimb' ? (hillClimbResult?.bestSimResult ?? null) : baselineResult;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="logo-group">
          <h1>GridRescue</h1>
          <span className="badge-phase">Hill Climbing Optimizer</span>
          <span className="badge-sim">Jaipur · OSM Road Network</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* Status message */}
          {statusMessage && (
            <span style={{
              fontSize: '0.75rem', color: '#92400e',
              background: '#fffbeb', border: '1px solid #fde68a',
              padding: '0.2rem 0.6rem', borderRadius: 4,
              maxWidth: 340, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {statusMessage}
            </span>
          )}

          {/* Seed control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#f9fafb', padding: '0.22rem 0.5rem', borderRadius: 5, border: '1px solid #d1d9e0' }}>
            <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>Seed</span>
            <input
              type="number"
              value={inputSeed}
              onChange={e => setInputSeed(e.target.value)}
              style={{ width: 42, background: '#ffffff', border: '1px solid #d1d9e0', color: '#111827', padding: '0.1rem 0.25rem', fontSize: '0.72rem', borderRadius: 3, outline: 'none' }}
            />
            <button onClick={() => handleRegenerate(parseInt(inputSeed, 10) || 42)} className="btn-action" style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem' }}>
              Generate
            </button>
          </div>

          {/* Quick seeds */}
          {[42, 108, 999].map(s => (
            <button
              key={s}
              onClick={() => handleRegenerate(s)}
              className={`pill-btn ${scenarioSeed === s ? 'active' : ''}`}
              style={{ padding: '0.2rem 0.45rem', fontSize: '0.68rem' }}
            >
              #{s}
            </button>
          ))}

          {/* Strategy dropdown */}
          <select
            value={selectedStrategy}
            onChange={e => setSelectedStrategy(e.target.value as Strategy)}
            disabled={isRunning}
            style={{
              padding: '0.26rem 0.5rem', fontSize: '0.75rem', fontWeight: 500,
              background: '#ffffff', border: '1px solid #d1d9e0', borderRadius: 5,
              color: '#111827', cursor: 'pointer', outline: 'none',
              fontFamily: 'inherit',
            }}
          >
            {STRATEGIES.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          {/* Run / Stop */}
          {isRunning ? (
            <button onClick={handleStop} className="btn-action btn-danger" style={{ padding: '0.3rem 0.9rem' }}>
              ■ Stop
            </button>
          ) : (
            <button
              onClick={handleRunDemo}
              disabled={!scenario}
              className="btn-action"
              style={{ padding: '0.3rem 1rem', opacity: scenario ? 1 : 0.45 }}
            >
              ▶ Run Demo
            </button>
          )}
        </div>
      </header>

      {/* ── Progress strip ─────────────────────────────────────────────── */}
      {isRunning && optimizerProgress && (
        <div style={{ padding: '0.3rem 1.5rem', background: '#f9fafb', borderBottom: '1px solid #d1d9e0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.7rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
            {activeStrategyLabel} · Restart {optimizerProgress.restart + 1} · Iter {optimizerProgress.iteration}
          </span>
          <div style={{ flex: 1, height: 3, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (optimizerProgress.totalIterations / 300) * 100)}%`, background: '#2563eb', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: '0.7rem', color: '#2563eb', ...S.mono, whiteSpace: 'nowrap' }}>
            J={optimizerProgress.bestJ.toFixed(1)}
          </span>
        </div>
      )}

      {/* ── KPI comparison bar ─────────────────────────────────────────── */}
      {(baselineKPIs || hillClimbKPIs) && scenario && (
        <div style={{ padding: '0.45rem 1.5rem', background: '#ffffff', borderBottom: '1px solid #d1d9e0', display: 'flex', gap: '0.6rem' }}>
          {baselineKPIs && baselineResult && (
            <button
              onClick={() => { setActivePlanView('baseline'); setActiveTab('dispatch'); }}
              style={{
                flex: 1, background: activePlanView === 'baseline' ? '#eff6ff' : '#f9fafb',
                border: `1px solid ${activePlanView === 'baseline' ? '#bfdbfe' : '#d1d9e0'}`,
                borderRadius: 6, padding: '0.5rem 0.85rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.65rem', textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Baseline (Greedy)</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#d97706', ...S.mono }}>J={baselineResult.costJ.toFixed(1)}</div>
                <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>
                  {baselineKPIs.resolvedCount}/{scenario.incidents.length} resolved · {baselineKPIs.avgResolutionTimeMinutes.toFixed(1)} min avg
                </div>
              </div>
              {activePlanView === 'baseline' && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#d97706', flexShrink: 0 }} />}
            </button>
          )}
          {hillClimbKPIs && hillClimbResult && (
            <button
              onClick={() => { setActivePlanView('hillclimb'); setActiveTab('dispatch'); }}
              style={{
                flex: 1, background: activePlanView === 'hillclimb' ? '#f0fdf4' : '#f9fafb',
                border: `1px solid ${activePlanView === 'hillclimb' ? '#bbf7d0' : '#d1d9e0'}`,
                borderRadius: 6, padding: '0.5rem 0.85rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.65rem', textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {activeStrategyLabel || 'Optimized'}
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#16a34a', ...S.mono }}>
                  J={hillClimbResult.bestCostJ.toFixed(1)}{' '}
                  <span style={{ fontSize: '0.7rem', color: '#16a34a' }}>−{hillClimbResult.improvementPct.toFixed(1)}%</span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>
                  {hillClimbKPIs.resolvedCount}/{scenario.incidents.length} resolved · {hillClimbKPIs.avgResolutionTimeMinutes.toFixed(1)} min avg
                </div>
              </div>
              {activePlanView === 'hillclimb' && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />}
            </button>
          )}
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="app-main">
        <div className="control-room-layout">

          {/* Map */}
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
                onNodeClick={id => selectNode(id)}
                onEdgeClick={edge => selectEdge(edge.id)}
                onEdgeToggle={handleToggleEdge}
                onPlaceClick={place => selectNode(place.nearestNodeId)}
                onIncidentClick={inc => { selectIncident(inc.id); selectNode(inc.node); setActiveTab('incidents'); }}
                onTeamClick={team => { selectTeam(team.id); selectNode(team.depotNode); setActiveTab('teams'); }}
                width={mapSize.width}
                height={mapSize.height}
              />
            ) : (
              <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading city graph…</div>
            )}
          </div>

          {/* ── Sidebar ──────────────────────────────────────────────── */}
          <aside className="sidebar-panel">

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: '0.2rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: 6, border: '1px solid #d1d9e0' }}>
              {(['incidents', 'facilities', 'teams', 'roads', 'dispatch'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pill-btn ${activeTab === tab ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center', fontSize: '0.67rem' }}
                >
                  {tab === 'incidents'   && `Incidents (${scenario?.incidents.length ?? 0})`}
                  {tab === 'facilities'  && `Facilities (${scenario?.facilities.length ?? 0})`}
                  {tab === 'teams'       && `Crews (${scenario?.teams.length ?? 0})`}
                  {tab === 'roads'       && `Roads (${blockedEdgeIds.size})`}
                  {tab === 'dispatch'    && `Dispatch ${activePlanView === 'hillclimb' ? '⛰' : '⚡'}`}
                </button>
              ))}
            </div>

            {/* ── TAB: Incidents ───────────────────────────────────── */}
            {activeTab === 'incidents' && (
              <div className="card" style={{ flex: 1, overflowY: 'auto', maxHeight: '580px' }}>
                <div className="card-title">
                  <span>Incidents</span>
                  <span style={S.tagRed}>PRIORITY QUEUE</span>
                </div>

                {currentIncident && (
                  <div style={{ background: '#f9fafb', padding: '0.65rem', borderRadius: 6, marginBottom: '0.65rem', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.83rem' }}>{currentIncident.placeName}</span>
                      <span style={S.tagRed}>SEV {currentIncident.severity}</span>
                    </div>
                    <div className="data-row"><span className="data-label">Type</span><span className="data-value">{INCIDENT_CONFIG[currentIncident.type]?.label}</span></div>
                    <div className="data-row"><span className="data-label">Required Skill</span><span className="data-value">{currentIncident.requiredSkill}</span></div>
                    <div className="data-row"><span className="data-label">Repair Time</span><span className="data-value">{currentIncident.baseRepairTime} min</span></div>
                    {currentIncident.dependsOn && (
                      <div className="data-row">
                        <span className="data-label">Depends On</span>
                        <span className="data-value" style={{ color: '#d97706' }}>{currentIncident.dependsOn}</span>
                      </div>
                    )}
                    {currentIncident.blockedEdgeId && (
                      <div className="data-row">
                        <span className="data-label">Blocks Road</span>
                        <span className="data-value" style={{ color: '#dc2626' }}>{currentIncident.blockedEdgeId}</span>
                      </div>
                    )}
                    <button onClick={() => selectIncident(null)} className="btn-action btn-secondary" style={{ width: '100%', marginTop: '0.45rem', fontSize: '0.72rem' }}>
                      Deselect
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {scenario?.incidents.map(inc => {
                    const conf = INCIDENT_CONFIG[inc.type] ?? { icon: '⚠️', color: '#dc2626', label: inc.type };
                    const isSel = selectedIncidentId === inc.id;
                    return (
                      <div
                        key={inc.id}
                        onClick={() => { selectIncident(inc.id); selectNode(inc.node); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '0.4rem 0.55rem',
                          background: isSel ? '#eff6ff' : '#ffffff',
                          border: `1px solid ${isSel ? '#bfdbfe' : '#e5e7eb'}`,
                          borderRadius: 6, cursor: 'pointer', transition: 'background 0.1s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span style={{ fontSize: '0.88rem' }}>{conf.icon}</span>
                          <div>
                            <div style={{ fontSize: '0.77rem', fontWeight: 600, color: '#111827' }}>{inc.placeName}</div>
                            <div style={{ fontSize: '0.67rem', color: '#9ca3af' }}>
                              {conf.label} · {inc.baseRepairTime}m · {inc.requiredSkill}
                              {inc.dependsOn ? ' · ⚠ DEP' : ''}
                              {inc.blockedEdgeId ? ' · ⛔ ROAD' : ''}
                            </div>
                          </div>
                        </div>
                        <span style={inc.severity >= 4 ? S.tagRed : S.tagAmber}>S{inc.severity}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── TAB: Facilities ─────────────────────────────────── */}
            {activeTab === 'facilities' && (
              <div className="card" style={{ flex: 1, overflowY: 'auto' }}>
                <div className="card-title">
                  <span>Critical Facilities</span>
                  <span style={S.tagGreen}>PROTECTION TARGETS</span>
                </div>

                {currentFacility && (
                  <div style={{ background: '#f9fafb', padding: '0.65rem', borderRadius: 6, marginBottom: '0.65rem', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.83rem', marginBottom: '0.3rem' }}>{currentFacility.name}</div>
                    <div className="data-row"><span className="data-label">Criticality Weight</span><span className="data-value">{currentFacility.criticalityWeight}×</span></div>
                    <div className="data-row">
                      <span className="data-label">Status</span>
                      <span className="data-value" style={{ color: currentFacility.incidentIds.length > 0 ? '#dc2626' : '#16a34a' }}>
                        {currentFacility.incidentIds.length > 0 ? `DEGRADED (${currentFacility.incidentIds.length})` : 'OPERATIONAL'}
                      </span>
                    </div>
                    <button onClick={() => selectFacility(null)} className="btn-action btn-secondary" style={{ width: '100%', marginTop: '0.45rem', fontSize: '0.72rem' }}>
                      Deselect
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {scenario?.facilities.map(fac => {
                    const isSel = selectedFacilityId === fac.id;
                    const isDeg = fac.incidentIds.length > 0;
                    return (
                      <div
                        key={fac.id}
                        onClick={() => { selectFacility(fac.id); selectNode(fac.node); }}
                        style={{
                          padding: '0.45rem 0.55rem',
                          background: isSel ? '#eff6ff' : '#ffffff',
                          border: `1px solid ${isSel ? '#bfdbfe' : '#e5e7eb'}`,
                          borderRadius: 6, cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#111827' }}>{fac.name}</span>
                          <span style={isDeg ? S.tagRed : S.tagGreen}>{isDeg ? 'DEGRADED' : 'OK'}</span>
                        </div>
                        <div style={{ fontSize: '0.67rem', color: '#9ca3af', marginTop: '0.15rem' }}>
                          {fac.type} · Crit {fac.criticalityWeight}×
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── TAB: Crews ───────────────────────────────────────── */}
            {activeTab === 'teams' && (
              <div className="card" style={{ flex: 1, overflowY: 'auto' }}>
                <div className="card-title">
                  <span>Dispatch Crews</span>
                  <span style={S.tagBlue}>SPECIALIZED</span>
                </div>

                {currentTeam && (
                  <div style={{ background: '#f9fafb', padding: '0.65rem', borderRadius: 6, marginBottom: '0.65rem', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.83rem', marginBottom: '0.3rem' }}>{currentTeam.name}</div>
                    <div className="data-row"><span className="data-label">Vehicle</span><span className="data-value">{currentTeam.vehicleType}</span></div>
                    <div className="data-row"><span className="data-label">Skills</span><span className="data-value">{currentTeam.skills.join(', ')}</span></div>
                    <div className="data-row"><span className="data-label">Status</span><span className="data-value" style={{ color: '#2563eb' }}>{currentTeam.status}</span></div>
                    <button onClick={() => selectTeam(null)} className="btn-action btn-secondary" style={{ width: '100%', marginTop: '0.45rem', fontSize: '0.72rem' }}>
                      Deselect
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {scenario?.teams.map(t => {
                    const isSel = selectedTeamId === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => { selectTeam(t.id); selectNode(t.depotNode); }}
                        style={{
                          padding: '0.4rem 0.55rem',
                          background: isSel ? '#eff6ff' : '#ffffff',
                          border: `1px solid ${isSel ? '#bfdbfe' : '#e5e7eb'}`,
                          borderRadius: 6, cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#111827' }}>{t.name}</span>
                          <span style={{ ...S.mono, fontSize: '0.67rem', color: '#6b7280' }}>{t.vehicleType}</span>
                        </div>
                        <div style={{ fontSize: '0.67rem', color: '#9ca3af', marginTop: '0.12rem' }}>
                          {t.skills.join(', ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── TAB: Roads ───────────────────────────────────────── */}
            {activeTab === 'roads' && (
              <div className="card" style={{ flex: 1 }}>
                <div className="card-title">
                  <span>Road Blockages</span>
                  <span style={blockedEdgeIds.size > 0 ? S.tagRed : S.tagGreen}>
                    {blockedEdgeIds.size} BLOCKED
                  </span>
                </div>

                {selectedEdge ? (
                  <div>
                    <div className="data-row"><span className="data-label">Road Name</span><span className="data-value">{selectedEdge.name || 'Unnamed'}</span></div>
                    <div className="data-row"><span className="data-label">Class</span><span className="data-value">{selectedEdge.highwayType ?? 'unclassified'}</span></div>
                    <div className="data-row"><span className="data-label">Length</span><span className="data-value">{Math.round(selectedEdge.length)} m</span></div>
                    <div className="data-row">
                      <span className="data-label">Status</span>
                      <span className="data-value" style={{ color: blockedEdgeIds.has(selectedEdge.id) ? '#dc2626' : '#16a34a' }}>
                        {blockedEdgeIds.has(selectedEdge.id) ? 'BLOCKED' : 'CLEAR'}
                      </span>
                    </div>
                    <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.4rem' }}>
                      <button onClick={() => handleToggleEdge(selectedEdge.id)} className={`btn-action ${blockedEdgeIds.has(selectedEdge.id) ? 'btn-danger' : ''}`} style={{ flex: 1 }}>
                        {blockedEdgeIds.has(selectedEdge.id) ? '⛔ Unblock' : '🚧 Block'}
                      </button>
                      <button onClick={() => selectEdge(null)} className="btn-action btn-secondary">Dismiss</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    <p>Click any road on the map to inspect or toggle blockage.</p>
                    {blockedEdgeIds.size > 0 && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <button onClick={clearBlockedEdges} className="btn-action btn-danger" style={{ width: '100%' }}>
                          Clear All ({blockedEdgeIds.size}) Blocked Roads
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: Dispatch ────────────────────────────────────── */}
            {activeTab === 'dispatch' && (
              <div className="card" style={{ flex: 1, overflowY: 'auto', maxHeight: '580px' }}>
                <div className="card-title">
                  <span>{activePlanView === 'hillclimb' ? '⛰ Optimized Plan' : '⚡ Baseline Plan'}</span>
                  <span style={activePlanView === 'hillclimb' ? S.tagGreen : S.tagBlue}>
                    {activePlanView === 'hillclimb'
                      ? (hillClimbResult ? `J=${hillClimbResult.bestCostJ.toFixed(1)}` : 'IN PROGRESS')
                      : (baselineResult ? `J=${baselineResult.costJ.toFixed(1)}` : 'NOT RUN')}
                  </span>
                </div>

                {(!activeSim || !activePlan) ? (
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '0.75rem 0', textAlign: 'center' }}>
                    No plan yet. Select a strategy above and press{' '}
                    <strong style={{ color: '#2563eb' }}>▶ Run Demo</strong>.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {/* Summary row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.55rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.72rem' }}>
                      <span style={{ color: '#6b7280' }}>{activePlan.assignments.length} assignments</span>
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>{activeSim.makespanMinutes.toFixed(1)} min makespan</span>
                    </div>

                    {/* Assignment list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.67rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Crew Dispatches
                      </span>
                      {activePlan.assignments.map((asgn, idx) => {
                        const inc  = scenario?.incidents.find(i => i.id === asgn.incidentId);
                        const team = scenario?.teams.find(t => t.id === asgn.teamId);
                        const isSel = selectedIncidentId === inc?.id;
                        return (
                          <div
                            key={idx}
                            onClick={() => { if (inc) { selectIncident(inc.id); selectNode(inc.node); } }}
                            style={{
                              padding: '0.38rem 0.5rem',
                              background: isSel ? '#eff6ff' : '#ffffff',
                              border: `1px solid ${isSel ? '#bfdbfe' : '#e5e7eb'}`,
                              borderRadius: 5, cursor: 'pointer', fontSize: '0.73rem',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, color: '#111827' }}>
                                {team?.name ?? asgn.teamId} → {inc?.placeName ?? asgn.incidentId}
                              </div>
                              <div style={{ fontSize: '0.66rem', color: '#9ca3af' }}>
                                Route #{asgn.routeIndex + 1} · {inc?.requiredSkill}
                              </div>
                            </div>
                            <span style={S.tagBlue}>#{idx + 1}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Timeline log — concise */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '0.67rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Timeline ({activeSim.events.length} events)
                      </span>
                      <div style={{
                        maxHeight: '160px', overflowY: 'auto',
                        background: '#f9fafb', border: '1px solid #e5e7eb',
                        borderRadius: 5, padding: '0.35rem',
                        fontSize: '0.68rem', display: 'flex', flexDirection: 'column', gap: '0.15rem',
                      }}>
                        {activeSim.events.map((evt, i) => (
                          <div key={i} style={{ color: '#4b5563', lineHeight: 1.35 }}>
                            <span style={{ ...S.mono, color: '#2563eb' }}>t={evt.timeMinutes.toFixed(1)}m</span>
                            {' '}· {evt.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </aside>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="app-footer">
        <div>GridRescue · Hill Climbing Dispatch Optimizer · Jaipur Infrastructure</div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <span>12 Incidents</span><span>8 Crews</span><span>5 Facilities</span>
          <span>© OpenStreetMap contributors (ODbL)</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
