import React, { useMemo, useState } from 'react';
import { GraphViewport } from './GraphViewport';

// Layout constants (SVG units)
const NODE_W = 232;
const NODE_H = 50;
const COL_GAP = 96;
const ROW_GAP = 16;
const PAD = 28;
const COL_CAP = 12; // nodes shown per column before "+N more"
const FILE_COLORS = ['#7aa2ff', '#c084fc', 'var(--gt-warn)', '#f472b6', '#2dd4bf', '#fb923c', '#60a5fa', '#a78bfa'];
const AGENT_COLOR = 'var(--gt-accent-text)';

const base = (p) => (p || '').split('/').pop();
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

// ---------------------------------------------------------------------------
// Data index: nodes (functions + agents), call edges both ways, extras per node
// ---------------------------------------------------------------------------
function buildIndex(data) {
  const nodes = new Map();
  (data.functions || []).forEach((f) => nodes.set(f.id, {
    id: f.id, name: f.name, file: f.file, line: f.start, end: f.end, kind: f.kind || 'function', docstring: f.docstring || '', type: 'function'
  }));
  (data.agents || []).forEach((a) => nodes.set(a.id, {
    id: a.id, name: a.variable || a.id.split('::').pop(), file: a.file, line: a.line, kind: 'agent', docstring: '', type: 'agent', tools: a.tools || [], call: a.call
  }));

  const out = new Map();
  const inn = new Map();
  const add = (from, to, line) => {
    if (!nodes.has(from) || !nodes.has(to) || from === to) return;
    const list = out.get(from) || [];
    let edge = list.find((e) => e.to === to);
    if (!edge) { edge = { to, lines: [] }; list.push(edge); out.set(from, list); }
    if (line != null) edge.lines.push(line);
    const back = inn.get(to) || [];
    if (!back.find((e) => e.from === from)) { back.push({ from }); inn.set(to, back); }
  };
  (data.edges || []).forEach((e) => add(e.from, e.to, e.line));
  (data.agent_edges || data.agent_calls || []).forEach((e) => add(e.from, e.to, e.line));

  const externalBy = new Map();
  (data.external || []).forEach((e) => {
    const m = externalBy.get(e.from) || new Map();
    m.set(e.name, (m.get(e.name) || 0) + 1);
    externalBy.set(e.from, m);
  });
  const unresolvedBy = new Map();
  (data.unresolved || data.unresolved_calls || []).forEach((u) => {
    const list = unresolvedBy.get(u.from) || [];
    list.push(u);
    unresolvedBy.set(u.from, list);
  });

  const fileCounts = new Map();
  nodes.forEach((n) => fileCounts.set(n.file, (fileCounts.get(n.file) || 0) + 1));
  const files = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const fileColor = new Map(files.map((f, i) => [f, FILE_COLORS[i % FILE_COLORS.length]]));

  const degree = (id) => (out.get(id)?.length || 0) + (inn.get(id)?.length || 0);
  const byDegree = [...nodes.keys()].sort((a, b) => degree(b) - degree(a));
  return { nodes, out, inn, externalBy, unresolvedBy, files, fileCounts, fileColor, degree, byDegree };
}

function bfs(starts, nextOf, maxDepth) {
  const dist = new Map();
  let frontier = [];
  starts.forEach((s) => { dist.set(s, 0); frontier.push(s); });
  for (let d = 1; d <= maxDepth && frontier.length; d += 1) {
    const nextFrontier = [];
    frontier.forEach((id) => nextOf(id).forEach((n) => {
      if (!dist.has(n)) { dist.set(n, d); nextFrontier.push(n); }
    }));
    frontier = nextFrontier;
  }
  return dist;
}

// Decide which nodes are visible and in which column.
function computeView(ix, { mode, roots, focusId, depth, showAll, selectedId }) {
  const fwd = (id) => (ix.out.get(id) || []).map((e) => e.to);
  const bwd = (id) => (ix.inn.get(id) || []).map((e) => e.from);
  const colOf = new Map();
  const required = new Set();

  if (mode === 'focus' && focusId && ix.nodes.has(focusId)) {
    required.add(focusId);
    bfs([focusId], fwd, depth).forEach((d, id) => colOf.set(id, d + depth));
    bfs([focusId], bwd, depth).forEach((d, id) => { if (!colOf.has(id)) colOf.set(id, depth - d); });
  } else {
    roots.forEach((r) => required.add(r));
    bfs(roots, fwd, depth).forEach((d, id) => colOf.set(id, d));
  }
  if (selectedId && colOf.has(selectedId)) required.add(selectedId);

  const used = [...colOf.values()];
  if (!used.length) return { cols: [], edges: [], hidden: [], total: 0 };
  const minCol = Math.min(...used);
  const maxCol = Math.max(...used);

  const cols = [];
  const hidden = [];
  for (let c = minCol; c <= maxCol; c += 1) {
    const ids = [...colOf.entries()].filter(([, col]) => col === c).map(([id]) => id);
    ids.sort((a, b) => (required.has(b) - required.has(a)) || (ix.degree(b) - ix.degree(a)));
    const kept = showAll ? ids : ids.slice(0, COL_CAP);
    kept.sort((a, b) => {
      const na = ix.nodes.get(a); const nb = ix.nodes.get(b);
      return (na.file || '').localeCompare(nb.file || '') || (na.line || 0) - (nb.line || 0);
    });
    cols.push(kept);
    hidden.push(ids.length - kept.length);
  }

  const visible = new Set(cols.flat());
  const edges = [];
  visible.forEach((from) => (ix.out.get(from) || []).forEach((e) => {
    if (visible.has(e.to)) edges.push({ from, to: e.to, lines: e.lines });
  }));
  return { cols, edges, hidden, total: colOf.size };
}

function layout(view) {
  const pos = new Map();
  const maxRows = Math.max(1, ...view.cols.map((c) => c.length + 0));
  const height = maxRows * (NODE_H + ROW_GAP) + PAD * 2 + 26;
  view.cols.forEach((ids, ci) => {
    const colH = ids.length * (NODE_H + ROW_GAP) - ROW_GAP;
    const top = PAD + ((maxRows * (NODE_H + ROW_GAP) - ROW_GAP) - colH) / 2;
    ids.forEach((id, ri) => pos.set(id, { x: PAD + ci * (NODE_W + COL_GAP), y: top + ri * (NODE_H + ROW_GAP), col: ci }));
  });
  const width = PAD * 2 + Math.max(1, view.cols.length) * NODE_W + Math.max(0, view.cols.length - 1) * COL_GAP;
  return { pos, width, height };
}

function edgePath(a, b) {
  if (b.col > a.col) {
    const x1 = a.x + NODE_W; const y1 = a.y + NODE_H / 2; const x2 = b.x; const y2 = b.y + NODE_H / 2;
    const k = Math.max(40, (x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`;
  }
  if (b.col === a.col) {
    const x = a.x + NODE_W; const y1 = a.y + NODE_H / 2; const y2 = b.y + NODE_H / 2;
    return `M${x},${y1} C${x + 54},${y1} ${x + 54},${y2} ${x},${y2}`;
  }
  const x1 = a.x; const y1 = a.y + NODE_H / 2; const x2 = b.x + NODE_W; const y2 = b.y + NODE_H / 2;
  return `M${x1},${y1} C${x1 - 50},${y1} ${x2 + 50},${y2} ${x2},${y2}`;
}

function Stat({ label, value, tone, hint }) {
  return (
    <div className="cg-stat" title={hint}>
      <div className="k">{label}</div>
      <div className="v" style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  );
}

export function CallGraphView({ callgraphData }) {
  const data = callgraphData || {};
  const ix = useMemo(() => buildIndex(data), [callgraphData]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each workflow step with its entry functions and how many functions it reaches (up to 6 levels).
  const stepsWithRoots = useMemo(() => (data.interactions || []).map((it, i) => {
    const roots = (it.roots || []).filter((r) => ix.nodes.has(r));
    const reach = roots.length ? bfs(roots, (id) => (ix.out.get(id) || []).map((e) => e.to), 6).size : 0;
    return { ...it, i, roots, reach };
  }), [ix]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstStep = stepsWithRoots.find((s) => s.roots.length);
  const bestStep = stepsWithRoots.reduce((best, s) => (s.reach > (best?.reach ?? 0) ? s : best), null);
  // Open on whichever view has something to show: a step that reaches several functions, else the most connected function.
  const startWithStep = Boolean(bestStep && bestStep.reach >= 3);

  const [mode, setMode] = useState(startWithStep ? 'steps' : 'focus');
  const [stepIdx, setStepIdx] = useState(startWithStep ? bestStep.i : (firstStep ? firstStep.i : 0));
  const [focusId, setFocusId] = useState(ix.byDegree[0] || null);
  const [depth, setDepth] = useState(3);
  const [showAll, setShowAll] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [search, setSearch] = useState('');
  const [showLimits, setShowLimits] = useState(false);

  const roots = mode === 'steps' ? (stepsWithRoots[stepIdx]?.roots || []) : [];
  const view = useMemo(
    () => computeView(ix, { mode, roots, focusId, depth, showAll, selectedId }),
    [ix, mode, stepIdx, focusId, depth, showAll, selectedId] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { pos, width, height } = useMemo(() => layout(view), [view]);

  if (!callgraphData || ix.nodes.size === 0) {
    return (
      <div className="cg"><div className="gt-glass cg-empty">
        <h3>No call graph available</h3>
        <p>Run the call graph stage, or open an agent whose run has finished.</p>
      </div></div>
    );
  }

  const stats = data.stats || {};
  const activeId = hoverId || selectedId;
  const near = new Set();
  if (activeId) {
    near.add(activeId);
    (ix.out.get(activeId) || []).forEach((e) => near.add(e.to));
    (ix.inn.get(activeId) || []).forEach((e) => near.add(e.from));
  }
  const selected = selectedId ? ix.nodes.get(selectedId) : null;
  const totalHidden = view.hidden.reduce((a, b) => a + b, 0);

  const results = (() => {
    const q = search.trim().toLowerCase();
    const all = q
      ? [...ix.nodes.values()].filter((n) => n.name.toLowerCase().includes(q) || (n.file || '').toLowerCase().includes(q) || (n.docstring || '').toLowerCase().includes(q))
      : ix.byDegree.map((id) => ix.nodes.get(id));
    return all.slice(0, 40);
  })();

  const focusOn = (id) => { setMode('focus'); setFocusId(id); setSelectedId(id); setShowAll(false); };
  const pickStep = (i) => { setMode('steps'); setStepIdx(i); setSelectedId(stepsWithRoots[i]?.roots[0] || null); setShowAll(false); };
  const callers = selected ? (ix.inn.get(selected.id) || []).map((e) => ix.nodes.get(e.from)) : [];
  const callees = selected ? (ix.out.get(selected.id) || []) : [];
  const externals = selected ? [...(ix.externalBy.get(selected.id) || new Map()).entries()] : [];
  const unresolved = selected ? (ix.unresolvedBy.get(selected.id) || []) : [];
  const stepInfo = mode === 'steps' ? stepsWithRoots[stepIdx] : null;

  return (
    <div className="cg animate-fade-in">
      <div className="cg-head">
        <div>
          <div className="gt-eyebrow"><i /> Function-level call graph</div>
          <h1>Who calls whom</h1>
          <p>Pick a workflow step or any function. Columns read left to right: the starting point, then what it calls, then what those call.</p>
        </div>
        <div className="cg-stats">
          <Stat label="Functions" value={stats.functions ?? ix.nodes.size} />
          <Stat label="Resolved calls" value={stats.resolved ?? (data.edges || []).length} tone="var(--gt-ok)" hint="Calls linked to a function in your repo" />
          <Stat label="External" value={stats.external ?? (data.external || []).length} hint="Calls into libraries outside the repo" />
          <Stat label="Unresolved" value={stats.unresolved ?? (data.unresolved || []).length} tone="var(--gt-warn)" hint="Calls the scanner could not pin to one function" />
        </div>
      </div>

      <div className="cg-layout">
        <aside className="gt-glass cg-side">
          <div className="cg-tabs">
            <button type="button" className={mode === 'steps' ? 'on' : ''} onClick={() => setMode('steps')} disabled={!firstStep}>Workflow steps</button>
            <button type="button" className={mode === 'focus' ? 'on' : ''} onClick={() => setMode('focus')}>Find a function</button>
          </div>

          {mode === 'steps' ? (
            <div className="cg-list">
              {stepsWithRoots.map((s) => (
                <button type="button" key={s.i} disabled={!s.roots.length} className={`cg-item${stepIdx === s.i ? ' on' : ''}`} onClick={() => pickStep(s.i)}>
                  <b>{s.step}</b>
                  <span>{!s.roots.length ? 'no code entry point' : s.reach > s.roots.length ? `${s.reach} functions reachable` : 'calls nothing resolved'}{s.tools?.length ? ` · ${s.tools.length} tools` : ''}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <input className="gt-field" style={{ padding: '10px 14px', fontSize: '13.5px', marginBottom: '10px' }} type="text" value={search}
                onChange={(e) => setSearch(e.target.value)} placeholder="Search function, file or docstring…" />
              <div className="cg-sub">{search ? `${results.length} matches` : 'Most connected'}</div>
              <div className="cg-list">
                {results.map((n) => (
                  <button type="button" key={n.id} className={`cg-item${focusId === n.id ? ' on' : ''}`} onClick={() => focusOn(n.id)}>
                    <b><i style={{ background: n.type === 'agent' ? AGENT_COLOR : ix.fileColor.get(n.file) }} />{clip(n.name, 30)}</b>
                    <span>{clip(n.file, 38)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        <section className="cg-main">
          <div className="gt-glass cg-toolbar">
            <div className="ttl">
              {mode === 'focus' && focusId
                ? <>Around <code>{ix.nodes.get(focusId)?.name}</code></>
                : <>Step <code>{stepInfo?.step || '—'}</code></>}
              <span> · {view.total} {view.total === 1 ? 'function' : 'functions'} within {depth} {depth === 1 ? 'level' : 'levels'}</span>
            </div>
            <label className="cg-ctl">Depth
              <input type="range" min="1" max="6" value={depth} onChange={(e) => { setDepth(Number(e.target.value)); setShowAll(false); }} />
              <b>{depth}</b>
            </label>
            {totalHidden > 0 && !showAll && (
              <button type="button" className="gt-link-btn" onClick={() => setShowAll(true)}>Show {totalHidden} hidden</button>
            )}
            {showAll && <button type="button" className="gt-link-btn" onClick={() => setShowAll(false)}>Show fewer</button>}
          </div>

          {mode === 'steps' && view.cols.length > 0 && view.total <= roots.length && (
            <div className="gt-banner" style={{ marginTop: 0, marginBottom: '12px' }}>
              <span>The entry {roots.length === 1 ? 'function' : 'functions'} of this step call nothing the scanner could resolve, usually because the calls go through <code>self.something</code> or a variable. Click a box to see the unresolved calls, or use <b>Find a function</b> to explore the connected part of the code.</span>
              <button type="button" className="gt-btn-ghost" style={{ padding: '7px 16px', fontSize: '12px' }} onClick={() => { setMode('focus'); setSelectedId(null); }}>Find a function</button>
            </div>
          )}
          <GraphViewport zoom={zoom} setZoom={setZoom} contentWidth={width} contentHeight={height}>
            {view.cols.length === 0 ? (
              <div className="cg-empty-inline">
                {mode === 'steps' ? 'This step has no code entry point recorded, so there is nothing to draw.' : 'Pick a function on the left.'}
              </div>
            ) : (
              <svg width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Call graph">
                <defs>
                  <marker id="cgArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6f7fb3" /></marker>
                  <marker id="cgArrowHot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--gt-accent-text)" /></marker>
                </defs>

                {view.edges.map((e) => {
                  const a = pos.get(e.from); const b = pos.get(e.to);
                  if (!a || !b) return null;
                  const hot = activeId && (e.from === activeId || e.to === activeId);
                  const dim = activeId && !hot;
                  return (
                    <path key={`${e.from}>${e.to}`} d={edgePath(a, b)} fill="none" markerEnd={hot ? 'url(#cgArrowHot)' : 'url(#cgArrow)'}
                      className={`cg-edge${hot ? ' hot' : ''}${dim ? ' dim' : ''}${b.col <= a.col ? ' back' : ''}`}>
                      <title>{`${ix.nodes.get(e.from)?.name} → ${ix.nodes.get(e.to)?.name}${e.lines.length ? ` (line ${e.lines.join(', ')})` : ''}`}</title>
                    </path>
                  );
                })}

                {view.cols.flat().map((id) => {
                  const n = ix.nodes.get(id); const p = pos.get(id);
                  const color = n.type === 'agent' ? AGENT_COLOR : ix.fileColor.get(n.file);
                  const isSel = id === selectedId;
                  const dim = activeId && !near.has(id);
                  return (
                    <g key={id} transform={`translate(${p.x},${p.y})`} className={`cg-node${isSel ? ' sel' : ''}${dim ? ' dim' : ''}`}
                      onMouseEnter={() => setHoverId(id)} onMouseLeave={() => setHoverId(null)}
                      onClick={() => setSelectedId(id)} onDoubleClick={() => focusOn(id)}>
                      <title>{`${n.name}\n${n.file}:${n.line}\nDouble-click to center on this function`}</title>
                      <rect width={NODE_W} height={NODE_H} rx="14" className="body" style={isSel ? { stroke: color } : undefined} />
                      <rect width="6" height={NODE_H} rx="3" style={{ fill: color }} />
                      <text x="20" y="21" className="nm">{clip(n.name, 27)}</text>
                      <text x="20" y="38" className="fl">{clip(`${base(n.file)}:${n.line}`, 34)}</text>
                      {n.type === 'agent' && <text x={NODE_W - 12} y="21" textAnchor="end" className="tag">AGENT</text>}
                    </g>
                  );
                })}

                {view.hidden.map((count, ci) => {
                  if (!count || showAll) return null;
                  const x = PAD + ci * (NODE_W + COL_GAP);
                  return (
                    <g key={`more${ci}`} transform={`translate(${x},${height - 34})`} className="cg-more" onClick={() => setShowAll(true)}>
                      <rect width={NODE_W} height="24" rx="12" />
                      <text x={NODE_W / 2} y="16" textAnchor="middle">+{count} more in this column</text>
                    </g>
                  );
                })}
              </svg>
            )}
          </GraphViewport>

          <div className="cg-foot">
            <div className="cg-legend">
              {ix.files.slice(0, 8).map((f) => (
                <span key={f} title={f}><i style={{ background: ix.fileColor.get(f) }} />{clip(base(f), 22)}</span>
              ))}
              {(data.agents || []).length > 0 && <span><i style={{ background: AGENT_COLOR }} />agent</span>}
              {ix.files.length > 8 && <span className="more">+{ix.files.length - 8} more files</span>}
            </div>
            <div className="cg-hint">Hover to trace a path · click for details · double-click to center · dashed lines loop back</div>
          </div>

          <button type="button" className="gt-link-btn" style={{ marginTop: '12px' }} onClick={() => setShowLimits((v) => !v)}>
            {showLimits ? 'Hide' : 'What this graph cannot see'}
          </button>
          {showLimits && (
            <div className="gt-glass cg-limits">
              <ul>{(data.limitations || []).map((l, i) => <li key={i}>{l}</li>)}</ul>
              {stats.unresolved_by_reason && (
                <div className="why">
                  {Object.entries(stats.unresolved_by_reason).map(([reason, count]) => (
                    <div key={reason}><span>{reason}</span><b>{count}</b></div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="gt-glass cg-detail">
          {!selected ? (
            <div className="cg-pick">
              <div className="big">Select a function</div>
              <p>Click any box in the graph to see who calls it, what it calls, and where in the file it lives.</p>
            </div>
          ) : (
            <>
              <div className="cg-dh">
                <span className="gt-badge">{selected.kind}</span>
                <h3>{selected.name}</h3>
                <code>{selected.file}:{selected.line}{selected.end ? `–${selected.end}` : ''}</code>
              </div>
              {selected.docstring && <p className="doc">{selected.docstring}</p>}
              {selected.type === 'agent' && selected.tools.length > 0 && (
                <div className="cg-sec"><div className="h">Tools it can use</div><div className="gt-chips">{selected.tools.map((t) => <span className="gt-chip" key={t}>{t}</span>)}</div></div>
              )}
              <button type="button" className="gt-btn-lime sm" style={{ width: '100%', justifyContent: 'center', marginBottom: '14px' }} onClick={() => focusOn(selected.id)}>Center the graph here</button>

              <div className="cg-sec">
                <div className="h">Called by <b>{callers.length}</b></div>
                {callers.length === 0 && <div className="none">Nothing in the repo calls this directly.</div>}
                {callers.map((c) => <button type="button" key={c.id} className="cg-link" onClick={() => focusOn(c.id)}>{clip(c.name, 34)}<span>{base(c.file)}</span></button>)}
              </div>
              <div className="cg-sec">
                <div className="h">Calls <b>{callees.length}</b></div>
                {callees.length === 0 && <div className="none">No direct calls to other repo functions.</div>}
                {callees.map((e) => {
                  const n = ix.nodes.get(e.to);
                  return <button type="button" key={e.to} className="cg-link" onClick={() => focusOn(e.to)}>{clip(n.name, 30)}<span>{e.lines.length ? `line ${e.lines[0]}` : base(n.file)}</span></button>;
                })}
              </div>
              {externals.length > 0 && (
                <div className="cg-sec">
                  <div className="h">External calls <b>{externals.length}</b></div>
                  <div className="gt-chips">{externals.slice(0, 12).map(([name, n]) => <span className="gt-chip" key={name}>{name}{n > 1 ? ` ×${n}` : ''}</span>)}</div>
                </div>
              )}
              {unresolved.length > 0 && (
                <div className="cg-sec">
                  <div className="h">Could not be resolved <b>{unresolved.length}</b></div>
                  {unresolved.slice(0, 6).map((u, i) => (
                    <div className="cg-unres" key={i}><code>{u.call}</code><span>line {u.line} · {u.reason}</span></div>
                  ))}
                  {unresolved.length > 6 && <div className="none">+{unresolved.length - 6} more</div>}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
