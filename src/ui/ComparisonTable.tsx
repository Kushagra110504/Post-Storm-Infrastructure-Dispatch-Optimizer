import React from 'react';
import { KPIs } from '../core/baseline/kpi';
import { SimulationResult } from '../core/plan/types';
import { HillClimbProgress, HillClimbResult, ConvergencePoint } from '../core/hillclimb/hillClimb';

interface ComparisonTableProps {
  baselineKPIs: KPIs | null;
  baselineResult: SimulationResult | null;
  hillClimbResult: HillClimbResult | null;
  hillClimbKPIs: KPIs | null;
  isOptimizing: boolean;
  currentProgress: HillClimbProgress | null;
  activePlanView: 'baseline' | 'hillclimb';
  onSelectPlanView: (view: 'baseline' | 'hillclimb') => void;
  onClose?: () => void;
}

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  baselineKPIs,
  baselineResult,
  hillClimbResult,
  hillClimbKPIs,
  isOptimizing,
  currentProgress,
  activePlanView,
  onSelectPlanView,
  onClose,
}) => {
  if (!baselineKPIs && !hillClimbKPIs && !isOptimizing) {
    return null;
  }

  const convergenceData: ConvergencePoint[] =
    currentProgress?.convergence ?? hillClimbResult?.convergence ?? [];

  // Prepare chart dimensions
  const chartWidth = 360;
  const chartHeight = 110;
  const padX = 35;
  const padY = 15;

  let pathString = '';
  let minJ = Infinity;
  let maxJ = -Infinity;

  if (convergenceData.length > 0) {
    for (const pt of convergenceData) {
      if (pt.costJ < minJ) minJ = pt.costJ;
      if (pt.costJ > maxJ) maxJ = pt.costJ;
    }
    if (minJ === maxJ) {
      minJ = Math.max(0, minJ - 10);
      maxJ += 10;
    }

    const maxIter = Math.max(
      ...convergenceData.map((d) => d.iteration),
      currentProgress?.totalIterations ?? 1
    );

    const points = convergenceData.map((pt) => {
      const x = padX + (pt.iteration / (maxIter || 1)) * (chartWidth - padX - 10);
      const y =
        chartHeight -
        padY -
        ((pt.costJ - minJ) / (maxJ - minJ || 1)) * (chartHeight - 2 * padY);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    pathString = points.join(' ');
  }

  const costImprovement =
    baselineKPIs && hillClimbKPIs
      ? ((baselineKPIs.costJ - hillClimbKPIs.costJ) / baselineKPIs.costJ) * 100
      : currentProgress?.improvementPct ?? 0;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98))',
        borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
        padding: '0.85rem 1.5rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      {/* Top Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: '0.85rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>⚖️ Optimization Benchmark:</span>
            <span style={{ color: '#cbd5e1' }}>Baseline vs Hill Climbing</span>
          </span>

          {isOptimizing && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#38bdf8',
                  animation: 'pulse 1.2s infinite ease-in-out',
                }}
              />
              Worker Optimizing (Iter {currentProgress?.totalIterations ?? 0}, Restart{' '}
              {currentProgress?.restart ?? 0})
            </span>
          )}

          {costImprovement > 0 && (
            <span
              style={{
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                background: 'rgba(52, 211, 153, 0.15)',
                border: '1px solid rgba(52, 211, 153, 0.4)',
                color: '#34d399',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              ▼ {costImprovement.toFixed(1)}% Cost Reduction
            </span>
          )}
        </div>

        {/* Plan inspection selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Inspect Plan:</span>
          <div
            style={{
              display: 'flex',
              background: '#0f172a',
              borderRadius: '4px',
              padding: '2px',
              border: '1px solid #334155',
            }}
          >
            <button
              onClick={() => onSelectPlanView('baseline')}
              disabled={!baselineResult}
              style={{
                background: activePlanView === 'baseline' ? '#2563eb' : 'transparent',
                color: activePlanView === 'baseline' ? '#fff' : '#94a3b8',
                border: 'none',
                padding: '0.2rem 0.6rem',
                borderRadius: '3px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: baselineResult ? 'pointer' : 'not-allowed',
                opacity: baselineResult ? 1 : 0.4,
              }}
            >
              Baseline
            </button>
            <button
              onClick={() => onSelectPlanView('hillclimb')}
              disabled={!hillClimbResult && !currentProgress}
              style={{
                background: activePlanView === 'hillclimb' ? '#059669' : 'transparent',
                color: activePlanView === 'hillclimb' ? '#fff' : '#94a3b8',
                border: 'none',
                padding: '0.2rem 0.6rem',
                borderRadius: '3px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: hillClimbResult || currentProgress ? 'pointer' : 'not-allowed',
                opacity: hillClimbResult || currentProgress ? 1 : 0.4,
              }}
            >
              Hill Climbing
            </button>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '1rem',
                marginLeft: '0.5rem',
              }}
              title="Close panel"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Comparison Grid & Convergence Curve */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(480px, 1fr) 380px',
          gap: '1.25rem',
          alignItems: 'stretch',
        }}
      >
        {/* Metric Comparison Table */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '6px',
            border: '1px solid rgba(51, 65, 85, 0.5)',
            overflow: 'hidden',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.75rem',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ background: 'rgba(30, 41, 59, 0.7)', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '0.4rem 0.75rem', color: '#94a3b8', fontWeight: 600 }}>Metric</th>
                <th style={{ padding: '0.4rem 0.75rem', color: '#60a5fa', fontWeight: 600 }}>
                  Baseline (Greedy)
                </th>
                <th style={{ padding: '0.4rem 0.75rem', color: '#34d399', fontWeight: 600 }}>
                  Hill Climbing (Restarts)
                </th>
                <th style={{ padding: '0.4rem 0.75rem', color: '#cbd5e1', fontWeight: 600 }}>Delta</th>
              </tr>
            </thead>
            <tbody>
              {/* Cost J */}
              <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.3)' }}>
                <td style={{ padding: '0.35rem 0.75rem', color: '#e2e8f0', fontWeight: 600 }}>
                  Total Cost J
                </td>
                <td style={{ padding: '0.35rem 0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                  {baselineKPIs ? baselineKPIs.costJ.toFixed(1) : '—'}
                </td>
                <td
                  style={{
                    padding: '0.35rem 0.75rem',
                    color: '#34d399',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                  }}
                >
                  {hillClimbKPIs
                    ? hillClimbKPIs.costJ.toFixed(1)
                    : currentProgress
                    ? currentProgress.bestJ.toFixed(1)
                    : '—'}
                </td>
                <td style={{ padding: '0.35rem 0.75rem', fontWeight: 600 }}>
                  {costImprovement > 0 ? (
                    <span style={{ color: '#34d399' }}>-{costImprovement.toFixed(1)}%</span>
                  ) : costImprovement === 0 && baselineKPIs ? (
                    <span style={{ color: '#94a3b8' }}>0.0%</span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>

              {/* Makespan */}
              <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.3)' }}>
                <td style={{ padding: '0.35rem 0.75rem', color: '#e2e8f0' }}>Makespan</td>
                <td style={{ padding: '0.35rem 0.75rem', color: '#94a3b8' }}>
                  {baselineKPIs ? `${baselineKPIs.makespanMinutes.toFixed(1)} min` : '—'}
                </td>
                <td style={{ padding: '0.35rem 0.75rem', color: '#f8fafc', fontWeight: 600 }}>
                  {hillClimbKPIs ? `${hillClimbKPIs.makespanMinutes.toFixed(1)} min` : '—'}
                </td>
                <td style={{ padding: '0.35rem 0.75rem' }}>
                  {baselineKPIs && hillClimbKPIs ? (
                    <span
                      style={{
                        color:
                          hillClimbKPIs.makespanMinutes <= baselineKPIs.makespanMinutes
                            ? '#34d399'
                            : '#f87171',
                      }}
                    >
                      {(hillClimbKPIs.makespanMinutes - baselineKPIs.makespanMinutes).toFixed(1)} min
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>

              {/* Avg Resolution Time */}
              <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.3)' }}>
                <td style={{ padding: '0.35rem 0.75rem', color: '#e2e8f0' }}>Avg Resolution Time</td>
                <td style={{ padding: '0.35rem 0.75rem', color: '#94a3b8' }}>
                  {baselineKPIs ? `${baselineKPIs.avgResolutionTimeMinutes.toFixed(1)} min` : '—'}
                </td>
                <td style={{ padding: '0.35rem 0.75rem', color: '#f8fafc', fontWeight: 600 }}>
                  {hillClimbKPIs ? `${hillClimbKPIs.avgResolutionTimeMinutes.toFixed(1)} min` : '—'}
                </td>
                <td style={{ padding: '0.35rem 0.75rem' }}>
                  {baselineKPIs && hillClimbKPIs ? (
                    <span
                      style={{
                        color:
                          hillClimbKPIs.avgResolutionTimeMinutes <=
                          baselineKPIs.avgResolutionTimeMinutes
                            ? '#34d399'
                            : '#f87171',
                      }}
                    >
                      {(
                        hillClimbKPIs.avgResolutionTimeMinutes -
                        baselineKPIs.avgResolutionTimeMinutes
                      ).toFixed(1)}{' '}
                      min
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>

              {/* Resolved / Unresolved */}
              <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.3)' }}>
                <td style={{ padding: '0.35rem 0.75rem', color: '#e2e8f0' }}>Incidents Resolved</td>
                <td style={{ padding: '0.35rem 0.75rem', color: '#94a3b8' }}>
                  {baselineKPIs
                    ? `${baselineKPIs.resolvedCount}/${baselineKPIs.resolvedCount + baselineKPIs.unresolvedCount}`
                    : '—'}
                </td>
                <td style={{ padding: '0.35rem 0.75rem', color: '#f8fafc', fontWeight: 600 }}>
                  {hillClimbKPIs
                    ? `${hillClimbKPIs.resolvedCount}/${hillClimbKPIs.resolvedCount + hillClimbKPIs.unresolvedCount}`
                    : '—'}
                </td>
                <td style={{ padding: '0.35rem 0.75rem', color: '#38bdf8' }}>
                  {baselineKPIs && hillClimbKPIs ? (
                    `${hillClimbKPIs.resolvedCount - baselineKPIs.resolvedCount >= 0 ? '+' : ''}${hillClimbKPIs.resolvedCount - baselineKPIs.resolvedCount}`
                  ) : (
                    '—'
                  )}
                </td>
              </tr>

              {/* Critical Facilities Restored */}
              <tr>
                <td style={{ padding: '0.35rem 0.75rem', color: '#e2e8f0' }}>Facilities Restored</td>
                <td style={{ padding: '0.35rem 0.75rem', color: '#94a3b8' }}>
                  {baselineKPIs
                    ? `${baselineKPIs.facilitiesRestored}/${baselineKPIs.totalFacilities}`
                    : '—'}
                </td>
                <td style={{ padding: '0.35rem 0.75rem', color: '#f8fafc', fontWeight: 600 }}>
                  {hillClimbKPIs
                    ? `${hillClimbKPIs.facilitiesRestored}/${hillClimbKPIs.totalFacilities}`
                    : '—'}
                </td>
                <td style={{ padding: '0.35rem 0.75rem', color: '#a78bfa' }}>
                  {baselineKPIs && hillClimbKPIs ? (
                    `${hillClimbKPIs.facilitiesRestored - baselineKPIs.facilitiesRestored >= 0 ? '+' : ''}${hillClimbKPIs.facilitiesRestored - baselineKPIs.facilitiesRestored}`
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* SVG Convergence Curve */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '6px',
            border: '1px solid rgba(51, 65, 85, 0.5)',
            padding: '0.5rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.7rem',
              color: '#94a3b8',
              fontWeight: 600,
            }}
          >
            <span>CONVERGENCE CURVE (COST J vs ITERATION)</span>
            {convergenceData.length > 0 && (
              <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>
                min J: {minJ.toFixed(0)}
              </span>
            )}
          </div>

          <div style={{ position: 'relative', width: '100%', height: `${chartHeight}px` }}>
            {convergenceData.length > 0 ? (
              <svg
                width="100%"
                height={chartHeight}
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                preserveAspectRatio="none"
                style={{ overflow: 'visible' }}
              >
                {/* Horizontal reference lines */}
                <line
                  x1={padX}
                  y1={padY}
                  x2={chartWidth - 5}
                  y2={padY}
                  stroke="#334155"
                  strokeDasharray="2,2"
                />
                <line
                  x1={padX}
                  y1={chartHeight - padY}
                  x2={chartWidth - 5}
                  y2={chartHeight - padY}
                  stroke="#334155"
                  strokeDasharray="2,2"
                />

                {/* Y-axis labels */}
                <text x={padX - 4} y={padY + 4} fill="#64748b" fontSize="8" textAnchor="end">
                  {maxJ.toFixed(0)}
                </text>
                <text
                  x={padX - 4}
                  y={chartHeight - padY + 3}
                  fill="#64748b"
                  fontSize="8"
                  textAnchor="end"
                >
                  {minJ.toFixed(0)}
                </text>

                {/* Convergence path */}
                <polyline
                  points={pathString}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Markers at improvements and restart transitions */}
                {convergenceData.map((pt, idx) => {
                  const maxIter = Math.max(
                    ...convergenceData.map((d) => d.iteration),
                    currentProgress?.totalIterations ?? 1
                  );
                  const cx = padX + (pt.iteration / (maxIter || 1)) * (chartWidth - padX - 10);
                  const cy =
                    chartHeight -
                    padY -
                    ((pt.costJ - minJ) / (maxJ - minJ || 1)) * (chartHeight - 2 * padY);

                  return (
                    <circle
                      key={idx}
                      cx={cx}
                      cy={cy}
                      r={pt.iteration === 0 ? 3 : 2.5}
                      fill={pt.iteration === 0 ? '#ef4444' : '#34d399'}
                      stroke="#0f172a"
                      strokeWidth="1"
                    />
                  );
                })}
              </svg>
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#475569',
                  fontSize: '0.72rem',
                }}
              >
                No optimization run data yet. Click &quot;⛰️ Run Optimizer&quot;.
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.65rem',
              color: '#64748b',
            }}
          >
            <span>Iteration 0 (Baseline)</span>
            <span>
              Restarts: {hillClimbResult ? 3 : currentProgress ? currentProgress.restart + 1 : 0} | Total Steps:{' '}
              {convergenceData.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
