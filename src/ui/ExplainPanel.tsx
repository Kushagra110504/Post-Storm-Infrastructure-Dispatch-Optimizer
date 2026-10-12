import React from 'react';
import { PlanDiffExplanation } from '../core/explain/explainer';

interface ExplainPanelProps {
  explanation: PlanDiffExplanation | null;
  onInjectHospitalFault: () => void;
  onInjectRoadBlockage: () => void;
  onInjectWaterFailure: () => void;
  onClose?: () => void;
  isReplanRunning?: boolean;
}

export const ExplainPanel: React.FC<ExplainPanelProps> = ({
  explanation,
  onInjectHospitalFault,
  onInjectRoadBlockage,
  onInjectWaterFailure,
  onClose,
  isReplanRunning = false,
}) => {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(24, 34, 53, 0.98))',
        borderBottom: '1px solid rgba(245, 158, 11, 0.35)',
        padding: '0.85rem 1.5rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      {/* Top Header & Injection Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: '0.85rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>🔄 Dynamic Replanning:</span>
            <span style={{ color: '#cbd5e1' }}>Disruption Management & Explainability</span>
          </span>

          {isReplanRunning && (
            <span
              style={{
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#f59e0b',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              Warm-start Replanning in Progress…
            </span>
          )}
        </div>

        {/* Quick Disruption Injection Triggers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Inject Disruption:</span>
          <button
            onClick={onInjectHospitalFault}
            disabled={isReplanRunning}
            className="btn-action"
            style={{
              padding: '0.2rem 0.5rem',
              fontSize: '0.72rem',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              cursor: isReplanRunning ? 'not-allowed' : 'pointer',
            }}
            title="Inject an emergency hospital power failure requiring immediate dispatch"
          >
            ⚡ Hospital Power Fault
          </button>
          <button
            onClick={onInjectRoadBlockage}
            disabled={isReplanRunning}
            className="btn-action"
            style={{
              padding: '0.2rem 0.5rem',
              fontSize: '0.72rem',
              background: 'rgba(245, 158, 11, 0.2)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#fbbf24',
              cursor: isReplanRunning ? 'not-allowed' : 'pointer',
            }}
            title="Block a key arterial road to test detour routing"
          >
            🚧 Block Arterial Road
          </button>
          <button
            onClick={onInjectWaterFailure}
            disabled={isReplanRunning}
            className="btn-action"
            style={{
              padding: '0.2rem 0.5rem',
              fontSize: '0.72rem',
              background: 'rgba(56, 189, 248, 0.2)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              cursor: isReplanRunning ? 'not-allowed' : 'pointer',
            }}
            title="Inject a major water treatment plant pipe rupture"
          >
            💧 Water Facility Burst
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '1rem',
                marginLeft: '0.4rem',
              }}
              title="Close panel"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Natural Language Explanation & Diff Grid */}
      {explanation ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            alignItems: 'stretch',
          }}
        >
          {/* Plain-Language Natural Narrative */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              borderRadius: '6px',
              border: '1px solid rgba(51, 65, 85, 0.5)',
              padding: '0.6rem 0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>
              EXPLAINABILITY NARRATIVE (WHY & WHAT CHANGED)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.74rem', color: '#cbd5e1' }}>
              {explanation.naturalLanguageSummary.map((item, idx) => (
                <div key={idx} style={{ lineHeight: 1.4 }}>
                  {item}
                </div>
              ))}
            </div>
            {/* KPI Delta Badges */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: '0.4rem',
                borderTop: '1px solid #1e293b',
                display: 'flex',
                gap: '1rem',
                fontSize: '0.7rem',
              }}
            >
              <span>
                Makespan Delta:{' '}
                <strong
                  style={{
                    color:
                      explanation.kpiDelta.makespanChangeMinutes <= 0 ? '#34d399' : '#f87171',
                  }}
                >
                  {explanation.kpiDelta.makespanChangeMinutes > 0 ? '+' : ''}
                  {explanation.kpiDelta.makespanChangeMinutes.toFixed(1)}m
                </strong>
              </span>
              <span>
                Cost Delta J:{' '}
                <strong
                  style={{
                    color: explanation.kpiDelta.costDeltaJ <= 0 ? '#34d399' : '#f87171',
                  }}
                >
                  {explanation.kpiDelta.costDeltaJ > 0 ? '+' : ''}
                  {explanation.kpiDelta.costDeltaJ.toFixed(1)}
                </strong>
              </span>
              <span>
                Facilities Restored:{' '}
                <strong style={{ color: '#a78bfa' }}>
                  {explanation.kpiDelta.facilitiesRestoredDelta >= 0 ? '+' : ''}
                  {explanation.kpiDelta.facilitiesRestoredDelta}
                </strong>
              </span>
            </div>
          </div>

          {/* Plan Diffs Table */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              borderRadius: '6px',
              border: '1px solid rgba(51, 65, 85, 0.5)',
              padding: '0.5rem',
              maxHeight: '140px',
              overflowY: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '0.25rem 0.4rem' }}>Incident</th>
                  <th style={{ padding: '0.25rem 0.4rem' }}>Type</th>
                  <th style={{ padding: '0.25rem 0.4rem' }}>Assignment</th>
                  <th style={{ padding: '0.25rem 0.4rem' }}>Route</th>
                </tr>
              </thead>
              <tbody>
                {explanation.diffs.map((diff, i) => {
                  let badgeBg = '#334155';
                  let badgeColor = '#94a3b8';
                  if (diff.type === 'NEW') {
                    badgeBg = 'rgba(52, 211, 153, 0.2)';
                    badgeColor = '#34d399';
                  } else if (diff.type === 'REASSIGNED') {
                    badgeBg = 'rgba(251, 191, 36, 0.2)';
                    badgeColor = '#fbbf24';
                  } else if (diff.type === 'REROUTED') {
                    badgeBg = 'rgba(56, 189, 248, 0.2)';
                    badgeColor = '#38bdf8';
                  }

                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.3)' }}>
                      <td style={{ padding: '0.25rem 0.4rem', color: '#f8fafc', fontWeight: 600 }}>
                        {diff.placeName}
                      </td>
                      <td style={{ padding: '0.25rem 0.4rem' }}>
                        <span
                          style={{
                            padding: '0.1rem 0.3rem',
                            borderRadius: '3px',
                            background: badgeBg,
                            color: badgeColor,
                            fontWeight: 700,
                            fontSize: '0.65rem',
                          }}
                        >
                          {diff.type}
                        </span>
                      </td>
                      <td style={{ padding: '0.25rem 0.4rem', color: '#cbd5e1' }}>
                        {diff.previousTeamName && diff.previousTeamName !== diff.newTeamName ? (
                          <span>
                            <span style={{ textDecoration: 'line-through', color: '#64748b' }}>
                              {diff.previousTeamName}
                            </span>{' '}
                            → {diff.newTeamName}
                          </span>
                        ) : (
                          diff.newTeamName
                        )}
                      </td>
                      <td style={{ padding: '0.25rem 0.4rem', color: '#94a3b8' }}>
                        Alt #{diff.newRouteIndex + 1}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ color: '#94a3b8', fontSize: '0.74rem' }}>
          No active disruption in current operational window. Trigger a mid-operation disruption above to test warm-start replanning and review plain-language explanations.
        </div>
      )}
    </div>
  );
};
