import React from 'react';

const NAV = ['spec', 'scan', 'callgraph', 'model', 'test', 'report'];
const TONE = { ok: 'var(--gt-ok)', warning: 'var(--gt-warn)', skipped: '#8fa0d6', failed: 'var(--gt-bad)' };

export function PipelineSummaryView({ summaryData, onNavigateStage }) {
  if (!summaryData) {
    return (
      <div className="cg"><div className="gt-glass cg-empty">
        <h3>No run summary yet</h3>
        <p>Start a run to see how long each stage took and what it found.</p>
      </div></div>
    );
  }

  const stages = summaryData.stages || [];
  const total = stages.reduce((a, s) => a + (s.seconds || 0), 0);
  const okCount = stages.filter((s) => s.status === 'ok').length;
  const maxSec = Math.max(0.01, ...stages.map((s) => s.seconds || 0));

  return (
    <div className="cg animate-fade-in">
      <div className="cg-head">
        <div>
          <div className="gt-eyebrow"><i /> Run summary</div>
          <h1>{summaryData.agent}</h1>
          <p>{summaryData.ok ? 'Every stage finished.' : 'The run finished with some problems. Open a stage below to see what happened.'}</p>
        </div>
        <div className="cg-stats">
          <div className="cg-stat"><div className="k">Status</div><div className="v" style={{ color: summaryData.ok ? 'var(--gt-ok)' : 'var(--gt-warn)', fontSize: '20px' }}>{summaryData.ok ? 'Healthy' : 'Degraded'}</div></div>
          <div className="cg-stat"><div className="k">Stages done</div><div className="v">{okCount}/{stages.length}</div></div>
          <div className="cg-stat"><div className="k">Total time</div><div className="v">{total.toFixed(1)}s</div></div>
        </div>
      </div>

      <div className="gt-glass ev-card" style={{ marginBottom: '16px' }}>
        <div className="ev-legend" style={{ marginTop: 0 }}>
          <span>Source <b style={{ fontFamily: 'var(--font-mono)' }}>{summaryData.source || 'local folder'}</b></span>
          <span>Commit <b>{summaryData.commit ? summaryData.commit.substring(0, 10) : 'local workspace'}</b></span>
        </div>
      </div>

      <div className="gt-glass ev-card">
        <div className="ev-h">What each stage did</div>
        <div className="ps-list">
          {stages.map((stg, idx) => {
            const c = TONE[stg.status] || TONE.skipped;
            return (
              <div key={idx} className="ps-row" style={{ '--c': c }}>
                <div className="num">{idx + 1}</div>
                <div className="body">
                  <div className="r1"><b>{stg.stage}</b><span className="tag">{stg.status}</span></div>
                  <div className="d">{stg.detail}</div>
                  <div className="bar"><div style={{ width: `${Math.max(2, ((stg.seconds || 0) / maxSec) * 100)}%` }} /></div>
                </div>
                <div className="end">
                  <span>{stg.seconds}s</span>
                  {onNavigateStage && NAV.includes(stg.stage) && <button type="button" className="gt-link-btn" onClick={() => onNavigateStage(stg.stage)}>View →</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
