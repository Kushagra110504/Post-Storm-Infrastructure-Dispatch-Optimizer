import React, { useState } from 'react';

export const App: React.FC = () => {
  const [seed] = useState<number>(42);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-group">
          <h1>GridRescue</h1>
          <span className="badge-sim">Real Map (Jaipur), Simulated Incidents</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            PRNG Seed: <code>{seed}</code>
          </span>
          <span style={{ fontSize: '0.875rem', color: 'var(--accent-emerald)' }}>
            System Ready (Phase 0)
          </span>
        </div>
      </header>

      <main className="app-main">
        <div className="status-card">
          <h2>Post-Storm Infrastructure Repair Dispatch</h2>
          <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
            GridRescue is an interactive control-room system optimizing post-storm infrastructure
            dispatch using Hill Climbing with random restarts on Jaipur's real road network.
          </p>
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid var(--accent-cyan)',
              borderRadius: '4px',
              fontSize: '0.875rem',
            }}
          >
            <strong>Operational Notice:</strong> Road network, junctions, and facilities are sourced
            from OpenStreetMap. All incidents, outages, severities, and crew dispatches are
            strictly simulated.
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <div>GridRescue v0.1.0 &bull; Control-Room Infrastructure Dispatch</div>
        <div>&copy; OpenStreetMap contributors (ODbL)</div>
      </footer>
    </div>
  );
};

export default App;
