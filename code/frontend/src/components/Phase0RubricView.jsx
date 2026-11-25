import React from 'react';

const SEV = { critical: '#f87171', major: '#fbbf24', minor: '#8fa0d6' };

export function Phase0RubricView({ specData, rubricData, onNavigateToQuestionnaire }) {
  if (!specData && !rubricData) {
    return (
      <div className="cg"><div className="gt-glass cg-empty">
        <h3>No requirements or rubric yet</h3>
        <p>They are created from the questionnaire answers when a run starts.</p>
        {onNavigateToQuestionnaire && <button type="button" className="gt-btn-lime" style={{ marginTop: '16px' }} onClick={onNavigateToQuestionnaire}>Open the questionnaire →</button>}
      </div></div>
    );
  }

  const items = rubricData?.items || [];
  const outOfScope = specData?.out_of_scope || [];
  const quality = specData?.quality;
  const runConfig = specData?.run_config;
  const count = (s) => items.filter((i) => i.severity === s).length;

  return (
    <div className="cg animate-fade-in">
      <div className="cg-head">
        <div>
          <div className="gt-eyebrow"><i /> Requirements and rubric</div>
          <h1>What “correct” means for this agent</h1>
          <p>Your answers become a rubric. Every test and judgement later is measured against these rules.</p>
        </div>
        <div className="cg-stats">
          <div className="cg-stat"><div className="k">Rules</div><div className="v">{items.length}</div></div>
          <div className="cg-stat"><div className="k">Critical</div><div className="v" style={{ color: SEV.critical }}>{count('critical')}</div></div>
          <div className="cg-stat"><div className="k">Major</div><div className="v" style={{ color: SEV.major }}>{count('major')}</div></div>
        </div>
      </div>
      {onNavigateToQuestionnaire && <div style={{ marginBottom: '14px' }}><button type="button" className="gt-link-btn" onClick={onNavigateToQuestionnaire}>Edit answers in the questionnaire ↗</button></div>}

      <div className="rb-layout">
        <div className="rb-left">
          <div className="gt-glass ev-card">
            <div className="tj-k">What the agent is for</div>
            <h2 className="rb-purpose">{specData?.purpose ? `“${specData.purpose}”` : 'Not specified'}</h2>
            <div className="ev-legend"><span>When a request is unclear it should <b style={{ fontFamily: 'var(--font-mono)' }}>{(specData?.ambiguity_policy || 'ask').toLowerCase()}</b></span></div>
          </div>

          <div className="gt-glass ev-card">
            <div className="ev-h">Must never do</div>
            {outOfScope.length === 0
              ? <p className="ev-note" style={{ marginTop: 0 }}>Nothing was declared out of scope.</p>
              : <div className="gt-chips">{outOfScope.map((o, i) => <span key={i} className="rb-no">⛔ {o}</span>)}</div>}
          </div>

          <div className="gt-glass ev-card">
            <div className="ev-h">How the run is set up</div>
            <div className="rb-cfg">
              <div><span>Interface</span><b>{runConfig?.interface || 'python_module'}</b></div>
              <div><span>Repeats</span><b>{runConfig?.repeats ?? 3} runs</b></div>
              <div><span>Critical failures allowed</span><b style={{ color: 'var(--gt-lime)' }}>{quality?.pass_threshold?.max_critical_failures ?? 0}</b></div>
            </div>
          </div>
        </div>

        <div className="gt-glass ev-card">
          <div className="ev-h">Grading rules <span>{items.length} · version {rubricData?.version || 'r1'}</span></div>
          <div className="tj-stack">
            {items.map((item, idx) => (
              <div key={idx} className="tj-rule" style={{ '--v': SEV[item.severity] || SEV.minor }}>
                <div className="top">
                  <div className="l"><b>{item.rule_id}</b><span className="tj-st">{item.severity}</span></div>
                  <span className="meth inline" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--gt-ink-faint)' }}>{item.check} · {item.kind}</span>
                </div>
                <p style={{ color: 'var(--gt-ink)', fontWeight: 600 }}>{item.description}</p>
                <div className="meth">from {item.source}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
