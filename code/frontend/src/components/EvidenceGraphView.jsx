import React, { useMemo, useState } from 'react';
import { GraphViewport } from './GraphViewport';
import { EvidenceGraphLegacy } from './EvidenceReportLegacy';

const NODE_W = 224;
const NODE_H = 58;
const COL_GAP = 92;
const ROW_GAP = 14;
const PAD = 28;
const HEAD = 34;
const COL_CAP = 12;

const STATUS = {
  confirmed: { color: 'var(--gt-ok)', label: 'Confirmed' },
  contradicted: { color: 'var(--gt-bad)', label: 'Contradicted' },
  discovered: { color: 'var(--gt-warn)', label: 'Discovered' },
  unverified: { color: '#8fa0d6', label: 'Unverified' }
};
const stat = (s) => STATUS[s] || STATUS.unverified;
const STATUS_ORDER = ['contradicted', 'discovered', 'confirmed', 'unverified'];

// Column = kind. Sources sit left, the finding on the right.
const KINDS = {
  code_location: { col: 0, label: 'Code', color: '#7aa2ff' },
  developer_rule: { col: 0, label: 'Your rule', color: 'var(--gt-warn)' },
  model_entry: { col: 1, label: 'Model entry', color: 'var(--gt-accent-text)' },
  test_spec: { col: 2, label: 'Test', color: '#c084fc' },
  trace: { col: 3, label: 'Conversation', color: '#2dd4bf' },
  finding: { col: 4, label: 'Finding', color: '#f472b6' }
};
const COL_TITLES = ['Where it came from', 'What we believe', 'How we tested it', 'What happened', 'What we concluded'];

const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const pct = (v) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : '—');

function titleOf(n) {
  switch (n.kind) {
    case 'code_location': return n.file.split('/').pop();
    case 'developer_rule': return `${n.rule_id}: ${n.description}`;
    case 'model_entry': return n.name;
    case 'test_spec': return n.test_id;
    case 'trace': return n.trace_id;
    case 'finding': return n.finding_id;
    default: return n.id;
  }
}
function subOf(n) {
  switch (n.kind) {
    case 'code_location': return `lines ${n.lines}${n.pattern ? ` · ${n.pattern}` : ''}`;
    case 'developer_rule': return `${n.rule_kind || 'rule'} · ${n.severity || ''}`;
    case 'model_entry': return `${n.entry_type} · ${pct(n.confidence)} sure`;
    case 'test_spec': return 'test scenario';
    case 'trace': return 'recorded run';
    case 'finding': return `${n.result || ''}${n.severity ? ` · ${n.severity}` : ''}`;
    default: return '';
  }
}
function accentOf(n) {
  if (n.kind === 'model_entry') return stat(n.status).color;
  if (n.kind === 'finding') return n.result === 'pass' ? 'var(--gt-ok)' : 'var(--gt-bad)';
  return KINDS[n.kind]?.color || '#8fa0d6';
}

function buildIndex(data) {
  const nodes = new Map((data.nodes || []).map((n) => [n.id, n]));
  const out = new Map();
  const inn = new Map();
  (data.edges || []).forEach((e) => {
    if (!nodes.has(e.from) || !nodes.has(e.to)) return;
    (out.get(e.from) || out.set(e.from, []).get(e.from)).push({ to: e.to, relation: e.relation });
    (inn.get(e.to) || inn.set(e.to, []).get(e.to)).push({ from: e.from, relation: e.relation });
  });
  const entries = [...nodes.values()].filter((n) => n.kind === 'model_entry');
  const findings = [...nodes.values()].filter((n) => n.kind === 'finding');
  const entryOfFinding = new Map();
  findings.forEach((f) => {
    const hit = (inn.get(f.id) || []).find((e) => e.relation === 'has_finding');
    if (hit) entryOfFinding.set(f.id, hit.from);
  });
  return { nodes, out, inn, entries, findings, entryOfFinding };
}

// Everything connected to one entry: sources behind it, tests/traces/findings after it.
function chainOf(ix, entryId) {
  const found = new Set([entryId]);
  const walk = (start, next) => {
    const stack = [start];
    while (stack.length) {
      const id = stack.pop();
      next(id).forEach((n) => { if (!found.has(n)) { found.add(n); stack.push(n); } });
    }
  };
  walk(entryId, (id) => (ix.out.get(id) || []).map((e) => e.to));
  (ix.inn.get(entryId) || []).forEach((e) => found.add(e.from));
  const cols = [[], [], [], [], []];
  found.forEach((id) => { const n = ix.nodes.get(id); const k = KINDS[n.kind]; if (k) cols[k.col].push(n); });
  cols.forEach((c) => c.sort((a, b) => (a.kind === b.kind ? titleOf(a).localeCompare(titleOf(b)) : a.kind === 'developer_rule' ? -1 : 1)));
  return { cols, ids: found };
}

function layoutChain(cols, showAll) {
  const shown = cols.map((c) => (showAll ? c : c.slice(0, COL_CAP)));
  const hidden = cols.map((c, i) => c.length - shown[i].length);
  const used = shown.map((c, i) => (c.length ? i : -1)).filter((i) => i >= 0);
  const xOf = new Map(used.map((c, i) => [c, PAD + i * (NODE_W + COL_GAP)]));
  const maxRows = Math.max(1, ...shown.map((c) => c.length));
  const rowsH = maxRows * (NODE_H + ROW_GAP) - ROW_GAP;
  const pos = new Map();
  shown.forEach((c, ci) => {
    const top = PAD + HEAD + (rowsH - (c.length * (NODE_H + ROW_GAP) - ROW_GAP)) / 2;
    c.forEach((n, ri) => pos.set(n.id, { x: xOf.get(ci), y: top + ri * (NODE_H + ROW_GAP), col: ci }));
  });
  return {
    shown, hidden, pos, xOf, used,
    width: PAD * 2 + used.length * NODE_W + Math.max(0, used.length - 1) * COL_GAP,
    height: PAD * 2 + HEAD + rowsH + (hidden.some(Boolean) ? 30 : 0)
  };
}

function curve(a, b) {
  const x1 = a.x + NODE_W; const y1 = a.y + NODE_H / 2; const x2 = b.x; const y2 = b.y + NODE_H / 2;
  const k = Math.max(36, (x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`;
}

function Tile({ label, value, tone }) {
  return (
    <div className="cg-stat">
      <div className="k">{label}</div>
      <div className="v" style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  );
}

function Overview({ ix, onOpen }) {
  const kindCount = (k) => [...ix.nodes.values()].filter((n) => n.kind === k).length;
  const byStatus = STATUS_ORDER.map((s) => [s, ix.entries.filter((e) => (e.status || 'unverified') === s).length]);
  const total = ix.entries.length || 1;
  const sorted = [...ix.findings].sort((a, b) => (a.result === 'fail' ? -1 : 1) - (b.result === 'fail' ? -1 : 1));
  return (
    <div className="ev-over">
      <div className="ev-funnel">
        {[['code_location', 'Code locations'], ['developer_rule', 'Your rules'], ['model_entry', 'Model entries'], ['test_spec', 'Tests'], ['trace', 'Conversations'], ['finding', 'Findings']].map(([k, label], i, arr) => (
          <React.Fragment key={k}>
            <div className="ev-step"><div className="n" style={{ color: KINDS[k].color }}>{kindCount(k)}</div><div className="l">{label}</div></div>
            {i < arr.length - 1 && <div className="ev-arrow">→</div>}
          </React.Fragment>
        ))}
      </div>

      <div className="gt-glass ev-card">
        <div className="ev-h">How much of the model is backed by evidence</div>
        <div className="ev-split">{byStatus.map(([s, n]) => n > 0 && <i key={s} style={{ width: `${(n / total) * 100}%`, background: STATUS[s].color }} title={`${STATUS[s].label}: ${n}`} />)}</div>
        <div className="ev-legend">{byStatus.map(([s, n]) => <span key={s}><i style={{ background: STATUS[s].color }} />{STATUS[s].label} <b>{n}</b></span>)}</div>
        {ix.findings.length === 0 && <p className="ev-note">No tests have run yet, so every entry is still based on code and your rules only.</p>}
      </div>

      {sorted.length > 0 && (
        <div className="gt-glass ev-card">
          <div className="ev-h">Findings <span>{ix.findings.length}</span></div>
          <div className="ev-findings">
            {sorted.map((f) => (
              <button type="button" key={f.id} className="ev-find" onClick={() => onOpen(ix.entryOfFinding.get(f.id), f.id)}>
                <span className="res" style={{ background: f.result === 'pass' ? 'var(--gt-ok)' : 'var(--gt-bad)' }}>{f.result === 'pass' ? '✓' : '✕'}</span>
                <span className="body">
                  <b>{f.finding_id}{f.severity ? <em> · {f.severity}</em> : null}</b>
                  <span>{clip(f.description, 170)}</span>
                  {f.status_change && <span className="chg">{f.status_change.from} → <b>{f.status_change.to}</b>{f.confidence_change ? ` · confidence ${pct(f.confidence_change.from)} → ${pct(f.confidence_change.to)}` : ''}</span>}
                </span>
                <span className="go">See chain →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Explorer({ ix, startEntry, startNode }) {
  const [entryId, setEntryId] = useState(startEntry);
  const [selected, setSelected] = useState(startNode || startEntry);
  const [hover, setHover] = useState(null);
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [zoom, setZoom] = useState(1);

  const types = useMemo(() => ['all', ...new Set(ix.entries.map((e) => e.entry_type))], [ix]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ix.entries
      .filter((e) => (filter === 'all' || (e.status || 'unverified') === filter) && (typeFilter === 'all' || e.entry_type === typeFilter) && (!q || (e.name || '').toLowerCase().includes(q)))
      .sort((a, b) => STATUS_ORDER.indexOf(a.status || 'unverified') - STATUS_ORDER.indexOf(b.status || 'unverified') || (a.confidence ?? 0) - (b.confidence ?? 0));
  }, [ix, filter, typeFilter, search]);

  const chain = useMemo(() => chainOf(ix, entryId), [ix, entryId]);
  const lay = useMemo(() => layoutChain(chain.cols, showAll), [chain, showAll]);
  const edges = useMemo(() => {
    const list2 = [];
    chain.ids.forEach((from) => (ix.out.get(from) || []).forEach((e) => {
      if (lay.pos.has(from) && lay.pos.has(e.to)) list2.push({ from, to: e.to, relation: e.relation });
    }));
    return list2;
  }, [chain, ix, lay]);

  const entry = ix.nodes.get(entryId);
  const active = hover || selected;
  const near = new Set(active ? [active] : []);
  if (active) { (ix.out.get(active) || []).forEach((e) => near.add(e.to)); (ix.inn.get(active) || []).forEach((e) => near.add(e.from)); }
  const sel = ix.nodes.get(selected);
  const hiddenTotal = lay.hidden.reduce((a, b) => a + b, 0);
  const tested = chain.cols[2].length > 0;

  const pickEntry = (id) => { setEntryId(id); setSelected(id); setShowAll(false); };

  return (
    <div className="cg-layout">
      <aside className="gt-glass cg-side">
        <input className="gt-field" style={{ padding: '10px 14px', fontSize: '13.5px', marginBottom: '10px' }} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search model entries…" />
        <div className="gt-pills" style={{ marginBottom: '8px' }}>
          {['all', ...STATUS_ORDER].map((s) => <button type="button" key={s} className={`gt-pill${filter === s ? ' on' : ''}`} style={{ padding: '5px 11px', fontSize: '11.5px' }} onClick={() => setFilter(s)}>{s === 'all' ? 'All' : STATUS[s].label}</button>)}
        </div>
        {types.length > 2 && (
          <div className="gt-pills" style={{ marginBottom: '10px' }}>
            {types.map((t) => <button type="button" key={t} className={`gt-pill${typeFilter === t ? ' on' : ''}`} style={{ padding: '5px 11px', fontSize: '11.5px' }} onClick={() => setTypeFilter(t)}>{t === 'all' ? 'Any type' : t}</button>)}
          </div>
        )}
        <div className="cg-sub">{list.length} {list.length === 1 ? 'entry' : 'entries'}</div>
        <div className="cg-list">
          {list.map((e) => (
            <button type="button" key={e.id} className={`cg-item${entryId === e.id ? ' on' : ''}`} onClick={() => pickEntry(e.id)}>
              <b><i style={{ background: stat(e.status).color }} />{clip(e.name, 30)}</b>
              <span>{e.entry_type} · {pct(e.confidence)}</span>
            </button>
          ))}
          {list.length === 0 && <div className="cg-sub">Nothing matches.</div>}
        </div>
      </aside>

      <section className="cg-main">
        <div className="gt-glass cg-toolbar">
          <div className="ttl">
            Evidence for <code>{entry?.name}</code>
            <span> · <i className="ev-dot" style={{ background: stat(entry?.status).color }} />{stat(entry?.status).label} · {pct(entry?.confidence)} sure</span>
          </div>
          {hiddenTotal > 0 && <button type="button" className="gt-link-btn" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show ${hiddenTotal} hidden`}</button>}
        </div>

        {!tested && <div className="gt-banner" style={{ marginTop: 0, marginBottom: '12px' }}><span>This entry has not been tested yet. Its evidence is the code and rules on the left only.</span></div>}

        <GraphViewport zoom={zoom} setZoom={setZoom} contentWidth={lay.width} contentHeight={lay.height}>
          <svg width={lay.width * zoom} height={lay.height * zoom} viewBox={`0 0 ${lay.width} ${lay.height}`} role="img" aria-label="Evidence chain">
            <defs>
              <marker id="evArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#6f7fb3" /></marker>
              <marker id="evArrowHot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--gt-accent-text)" /></marker>
            </defs>
            {lay.used.map((c) => <text key={`h${c}`} x={lay.xOf.get(c)} y={PAD + 8} className="ev-colhead">{COL_TITLES[c].toUpperCase()}</text>)}
            {edges.map((e) => {
              const hot = active && (e.from === active || e.to === active);
              const dim = active && !hot;
              return (
                <path key={`${e.from}>${e.to}`} d={curve(lay.pos.get(e.from), lay.pos.get(e.to))} fill="none" markerEnd={hot ? 'url(#evArrowHot)' : 'url(#evArrow)'}
                  className={`cg-edge${hot ? ' hot' : ''}${dim ? ' dim' : ''}${e.relation === 'has_finding' ? ' back' : ''}`}>
                  <title>{e.relation.replace('_', ' ')}</title>
                </path>
              );
            })}
            {lay.shown.flat().map((n) => {
              const p = lay.pos.get(n.id);
              const color = accentOf(n);
              const dim = active && !near.has(n.id);
              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`} className={`cg-node${n.id === selected ? ' sel' : ''}${dim ? ' dim' : ''}`}
                  onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => setSelected(n.id)}>
                  <title>{titleOf(n)}</title>
                  <rect width={NODE_W} height={NODE_H} rx="14" className="body" style={n.id === selected ? { stroke: color } : undefined} />
                  <rect width="6" height={NODE_H} rx="3" style={{ fill: color }} />
                  <text x="20" y="22" className="nm">{clip(titleOf(n), 26)}</text>
                  <text x="20" y="40" className="fl">{clip(subOf(n), 33)}</text>
                  <text x={NODE_W - 12} y="22" textAnchor="end" className="tag" style={{ fill: color }}>{KINDS[n.kind].label.toUpperCase()}</text>
                </g>
              );
            })}
            {lay.hidden.map((c, ci) => (c && !showAll ? (
              <g key={`m${ci}`} transform={`translate(${lay.xOf.get(ci)},${lay.height - 34})`} className="cg-more" onClick={() => setShowAll(true)}>
                <rect width={NODE_W} height="24" rx="12" /><text x={NODE_W / 2} y="16" textAnchor="middle">+{c} more</text>
              </g>
            ) : null))}
          </svg>
        </GraphViewport>
        <div className="cg-foot"><div className="cg-hint">Hover to trace a path · click a box for details · pinch to zoom · dashed line: the entry's direct link to a finding</div></div>
      </section>

      <aside className="gt-glass cg-detail">
        {sel && (
          <>
            <div className="cg-dh">
              <span className="gt-badge" style={{ color: accentOf(sel) }}>{KINDS[sel.kind].label}</span>
              <h3>{titleOf(sel)}</h3>
            </div>
            {sel.kind === 'model_entry' && (
              <div className="cg-sec"><div className="h">Status</div>
                <div className="gt-chips"><span className="gt-chip">{stat(sel.status).label}</span><span className="gt-chip">{pct(sel.confidence)} sure</span><span className="gt-chip">{sel.entry_type}</span>{sel.detected_by && <span className="gt-chip">found by {sel.detected_by}</span>}</div>
              </div>
            )}
            {sel.kind === 'finding' && (
              <>
                <p className="doc">{sel.description}</p>
                {sel.status_change && <div className="cg-sec"><div className="h">What changed</div><div className="gt-chips"><span className="gt-chip">{sel.status_change.from} → {sel.status_change.to}</span>{sel.confidence_change && <span className="gt-chip">{pct(sel.confidence_change.from)} → {pct(sel.confidence_change.to)}</span>}</div></div>}
              </>
            )}
            {sel.kind === 'code_location' && <div className="cg-sec"><div className="h">Location</div><code>{sel.file}:{sel.lines}</code>{sel.pattern && <div className="none" style={{ marginTop: '6px' }}>Found by pattern {sel.pattern}</div>}</div>}
            {sel.kind === 'developer_rule' && <p className="doc">{sel.description}</p>}
            {(sel.kind === 'test_spec' || sel.kind === 'trace') && <p className="doc">{sel.kind === 'test_spec' ? 'A generated test scenario aimed at this entry.' : 'The raw conversation recorded when the test ran.'}</p>}
            <div className="cg-sec">
              <div className="h">Connected to <b>{((ix.out.get(sel.id) || []).length + (ix.inn.get(sel.id) || []).length)}</b></div>
              {[...(ix.inn.get(sel.id) || []).map((e) => ({ id: e.from, rel: e.relation, dir: 'from' })), ...(ix.out.get(sel.id) || []).map((e) => ({ id: e.to, rel: e.relation, dir: 'to' }))].slice(0, 14).map((c) => {
                const n = ix.nodes.get(c.id);
                return <button type="button" key={`${c.dir}${c.id}`} className="cg-link" onClick={() => { if (n.kind === 'model_entry') pickEntry(n.id); else setSelected(n.id); }}>{clip(titleOf(n), 30)}<span>{c.dir === 'from' ? `${c.rel} →` : `→ ${c.rel}`}</span></button>;
              })}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export function EvidenceGraphView({ evidenceData, reportData, currentAgent }) {
  const ix = useMemo(() => buildIndex(evidenceData || {}), [evidenceData]);
  const [tab, setTab] = useState('overview');
  const [focus, setFocus] = useState(null); // { entry, node }

  if (!evidenceData || ix.nodes.size === 0) {
    return (
      <div className="cg"><div className="gt-glass cg-empty">
        <h3>No evidence graph available</h3>
        <p>The evidence graph is built by the last stage of the run.</p>
      </div></div>
    );
  }

  const stats = evidenceData.stats || {};
  const firstEntry = (ix.findings.find((f) => f.result !== 'pass') && ix.entryOfFinding.get(ix.findings.find((f) => f.result !== 'pass').id))
    || [...ix.entries].sort((a, b) => STATUS_ORDER.indexOf(a.status || 'unverified') - STATUS_ORDER.indexOf(b.status || 'unverified'))[0]?.id;
  const open = (entry, node) => { setFocus({ entry: entry || firstEntry, node }); setTab('chain'); };
  const fails = ix.findings.filter((f) => f.result !== 'pass').length;

  return (
    <div className="cg animate-fade-in">
      <div className="cg-head">
        <div>
          <div className="gt-eyebrow"><i /> Evidence graph</div>
          <h1>Why we believe what we report</h1>
          <p>Every conclusion links back to the test that produced it and the code or rule that justified the claim.</p>
        </div>
        <div className="cg-stats">
          <Tile label="Model entries" value={ix.entries.length} />
          <Tile label="Tests" value={[...ix.nodes.values()].filter((n) => n.kind === 'test_spec').length} />
          <Tile label="Findings" value={ix.findings.length} />
          <Tile label="Failed" value={fails} tone={fails ? 'var(--gt-bad)' : 'var(--gt-ok)'} />
        </div>
      </div>

      <div className="cg-tabs ev-tabs">
        {[['overview', 'Overview'], ['chain', 'Evidence chains'], ['report', 'Report & export']].map(([id, label]) => (
          <button type="button" key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
        <span className="ev-built">{stats.nodes ?? ix.nodes.size} nodes · {stats.edges ?? (evidenceData.edges || []).length} links</span>
      </div>

      {tab === 'overview' && <Overview ix={ix} onOpen={open} />}
      {tab === 'chain' && <Explorer key={`${focus?.entry || firstEntry}`} ix={ix} startEntry={focus?.entry || firstEntry} startNode={focus?.node} />}
      {tab === 'report' && (
        <div className="legacy-canvas gt-out-sheet" style={{ marginTop: '4px' }}>
          <EvidenceGraphLegacy evidenceData={evidenceData} reportData={reportData} currentAgent={currentAgent} initialTab="report" />
        </div>
      )}
    </div>
  );
}
