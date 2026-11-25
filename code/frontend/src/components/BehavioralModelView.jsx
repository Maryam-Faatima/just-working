import React, { useMemo, useState } from 'react';
import { LiveModelChanges } from './LiveModelChanges';

const STATUS = {
  confirmed: { color: 'var(--gt-ok)', label: 'Confirmed' },
  contradicted: { color: 'var(--gt-bad)', label: 'Contradicted' },
  discovered: { color: 'var(--gt-warn)', label: 'Discovered' },
  unverified: { color: '#8fa0d6', label: 'Unverified' }
};
const stat = (s) => STATUS[s] || STATUS.unverified;
const TYPES = {
  capability: { label: 'Capability', color: 'var(--gt-accent-text)', hint: 'something the agent can do' },
  workflow: { label: 'Workflow', color: '#7aa2ff', hint: 'a step or state in how it works' },
  constraint: { label: 'Constraint', color: 'var(--gt-warn)', hint: 'a rule it should follow' }
};
const typeOf = (t) => TYPES[t] || { label: t || 'Entry', color: '#8fa0d6', hint: '' };

export function BehavioralModelView({ modelData, onSelectEntry, currentAgent }) {
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(null);

  const entries = useMemo(() => (modelData && modelData.entries) || [], [modelData]);
  const count = (t) => entries.filter((e) => e.type === t).length;

  const shown = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((e) => (
      (filterType === 'ALL' || e.type === filterType)
      && (filterStatus === 'all' || (e.status || 'unverified') === filterStatus)
      && (!q || (e.name || '').toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q))
    ));
  }, [entries, filterType, filterStatus, searchQuery]);

  if (!modelData) {
    return (
      <div className="cg"><div className="gt-glass cg-empty">
        <h3>No behavioral model yet</h3>
        <p>The model is built after the code scan. It will appear here as soon as that stage finishes.</p>
      </div></div>
    );
  }

  const statusCounts = Object.keys(STATUS).map((s) => [s, entries.filter((e) => (e.status || 'unverified') === s).length]);
  const total = entries.length || 1;

  return (
    <div className="cg animate-fade-in">
      <div className="cg-head">
        <div>
          <div className="gt-eyebrow"><i /> Behavioral model {(modelData.version || 'v0').toUpperCase()}</div>
          <h1>What we think your agent does</h1>
          <p>Each entry is a claim about the agent, found by the code scanner or the language model, with the code that backs it up. Tests later confirm or contradict these claims.</p>
        </div>
        <div className="cg-stats">
          <div className="cg-stat"><div className="k">Capabilities</div><div className="v" style={{ color: TYPES.capability.color }}>{count('capability')}</div></div>
          <div className="cg-stat"><div className="k">Workflow</div><div className="v" style={{ color: TYPES.workflow.color }}>{count('workflow')}</div></div>
          <div className="cg-stat"><div className="k">Constraints</div><div className="v" style={{ color: TYPES.constraint.color }}>{count('constraint')}</div></div>
        </div>
      </div>

      <div className="legacy-canvas gt-out-sheet" style={{ marginBottom: '16px', padding: '4px 0' }}>
        <LiveModelChanges agentName={currentAgent} />
      </div>

      <div className="gt-glass ev-card" style={{ marginBottom: '16px' }}>
        <div className="ev-h">How well each entry has been checked</div>
        <div className="ev-split">
          {statusCounts.map(([s, n]) => n > 0 && <i key={s} style={{ width: `${(n / total) * 100}%`, background: stat(s).color }} title={`${stat(s).label}: ${n}`} />)}
        </div>
        <div className="ev-legend">
          {statusCounts.map(([s, n]) => <span key={s}><i style={{ background: stat(s).color }} />{stat(s).label} <b>{n}</b></span>)}
        </div>
      </div>

      <div className="bm-bar">
        <div className="cg-tabs" style={{ margin: 0 }}>
          {[['ALL', `All ${entries.length}`], ['capability', `Capabilities ${count('capability')}`], ['workflow', `Workflow ${count('workflow')}`], ['constraint', `Constraints ${count('constraint')}`]].map(([id, label]) => (
            <button type="button" key={id} className={filterType === id ? 'on' : ''} onClick={() => setFilterType(id)}>{label}</button>
          ))}
        </div>
        <div className="gt-pills">
          {['all', ...Object.keys(STATUS)].map((s) => (
            <button type="button" key={s} className={`gt-pill${filterStatus === s ? ' on' : ''}`} style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setFilterStatus(s)}>{s === 'all' ? 'Any status' : STATUS[s].label}</button>
          ))}
        </div>
        <input className="gt-field bm-search" type="text" placeholder="Search entries…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {shown.length === 0 && <div className="gt-glass cg-empty"><h3>Nothing matches</h3><p>Try a different filter or search.</p></div>}

      <div className="bm-grid">
        {shown.map((entry) => {
          const t = typeOf(entry.type);
          const st = stat(entry.status);
          const conf = Math.round((entry.confidence || 0) * 100);
          const isOpen = open === entry.id;
          const cons = entry.constraints || [];
          const ev = entry.evidence || [];
          return (
            <div key={entry.id} className={`gt-glass bm-card${isOpen ? ' open' : ''}`} style={{ '--bm': t.color }}>
              <button type="button" className="bm-top" onClick={() => { setOpen(isOpen ? null : entry.id); if (onSelectEntry) onSelectEntry(entry); }}>
                <div className="bm-tags">
                  <span className="bm-type" style={{ color: t.color }}>{t.label}</span>
                  <span className="bm-st"><i style={{ background: st.color }} />{st.label}</span>
                  <span className="bm-id">{entry.id}</span>
                </div>
                <h3>{entry.name}</h3>
                <p>{entry.description}</p>
              </button>
              <div className="bm-conf">
                <div className="row"><span>How sure we are</span><b>{conf}%</b></div>
                <div className="track"><div style={{ width: `${conf}%`, background: st.color }} /></div>
              </div>
              {isOpen && (
                <div className="bm-more">
                  {cons.length > 0 && (
                    <div><div className="h">Rules found ({cons.length})</div>{cons.map((c, i) => <div key={i} className="bm-con">{c}</div>)}</div>
                  )}
                  {ev.length > 0 && (
                    <div><div className="h">Where in the code</div>{ev.map((x, i) => <div key={i} className="bm-ev"><span>{x.file}</span><span>L{x.lines}</span></div>)}</div>
                  )}
                  {entry.detected_by && <div className="bm-by">Found by {entry.detected_by}</div>}
                  {cons.length === 0 && ev.length === 0 && <div className="bm-by">No extra detail recorded for this entry.</div>}
                </div>
              )}
              {!isOpen && (cons.length > 0 || ev.length > 0) && <div className="bm-hint">{cons.length ? `${cons.length} rules` : ''}{cons.length && ev.length ? ' · ' : ''}{ev.length ? `${ev.length} code refs` : ''} · click to expand</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
