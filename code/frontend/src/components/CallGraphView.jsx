import React, { useState, useMemo } from 'react';

export function CallGraphView({ callgraphData, onSelectFunction }) {
  const [viewMode, setViewMode] = useState('tree'); // 'tree' | 'explorer'
  const [treeDisplayType, setTreeDisplayType] = useState('canvas'); // 'canvas' | 'outline'
  const [filterFile, setFilterFile] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFuncId, setSelectedFuncId] = useState(null);
  const [selectedTreeNode, setSelectedTreeNode] = useState(null);
  const [treeSearch, setTreeSearch] = useState('');
  const [treeLimit, setTreeLimit] = useState(25); // Cap initial SVG tree nodes for 60fps rendering
  const [functionPage, setFunctionPage] = useState(1);
  const FUNCTIONS_PER_PAGE = 40;

  if (!callgraphData) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '48px 24px', border: '1.5px solid var(--border-default)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink-primary)' }}>No Call Graph Available</h3>
          <p style={{ color: 'var(--ink-muted)', marginTop: '8px' }}>Run the callgraph stage or select an agent with completed outputs.</p>
        </div>
      </div>
    );
  }

  const functions = callgraphData.functions || [];
  const edges = callgraphData.edges || [];
  const agentCalls = callgraphData.agent_edges || callgraphData.agent_calls || [];
  const unresolved = callgraphData.unresolved || callgraphData.unresolved_calls || [];
  const interactions = callgraphData.interactions || [];

  const [expandedSteps, setExpandedSteps] = useState(() => {
    return new Set(interactions.map((_, i) => i));
  });

  const toggleStep = (idx) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSteps(new Set(interactions.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedSteps(new Set());
  };

  const numFunctions = callgraphData.stats?.functions ?? functions.length;
  const numResolved = callgraphData.stats?.resolved ?? edges.length;
  const numAgentCalls = callgraphData.stats?.agent_calls ?? agentCalls.length;
  const numUnresolved = callgraphData.stats?.unresolved ?? unresolved.length;

  const files = useMemo(() => {
    const set = new Set(functions.map(f => f.file));
    return ['ALL', ...Array.from(set).sort()];
  }, [functions]);

  const filteredFunctions = useMemo(() => {
    return functions.filter(f => {
      const matchFile = filterFile === 'ALL' || f.file === filterFile;
      const matchSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (f.docstring && f.docstring.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchFile && matchSearch;
    });
  }, [functions, filterFile, searchQuery]);

  const filteredInteractions = useMemo(() => {
    if (!treeSearch) return interactions;
    const q = treeSearch.toLowerCase();
    return interactions.filter(it => {
      if (it.step.toLowerCase().includes(q)) return true;
      if (it.roots?.some(r => r.toLowerCase().includes(q))) return true;
      if (it.functions?.some(f => f.toLowerCase().includes(q))) return true;
      if (it.agents?.some(a => a.toLowerCase().includes(q))) return true;
      if (it.tools?.some(t => t.name.toLowerCase().includes(q) || t.path?.some(p => p.toLowerCase().includes(q)))) return true;
      return false;
    });
  }, [interactions, treeSearch]);

  // Selected Function Relationships
  const selectedFunc = functions.find(f => f.id === selectedFuncId);
  const outgoingCalls = edges.filter(e => e.from === selectedFuncId);
  const outgoingAgentCalls = agentCalls.filter(e => e.from === selectedFuncId);
  const incomingCalls = edges.filter(e => e.to === selectedFuncId);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto 80px', padding: '0 24px' }}>
      {/* Eyebrow Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          color: 'var(--accent)',
          fontSize: '11px',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          marginBottom: '6px'
        }}>
          <span>✦</span> Function-Level Call Graph
        </div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '30px', fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.6px' }}>
          Inter-Function Call Graph & Component Tree
        </h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '14.5px', marginTop: '4px' }}>
          Hierarchical execution traces and direct caller-callee resolution linking LangGraph state nodes, agent runners, tools, and vector retrievals.
        </p>
      </div>

      {/* Metrics Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px',
        marginBottom: '26px'
      }}>
        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Functions</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '4px' }}>
            {numFunctions}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>declared in codebase</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--status-confirmed)', textTransform: 'uppercase' }}>Resolved Calls</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--status-confirmed)', marginTop: '4px' }}>
            {numResolved}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>direct AST function links</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Agent Invocations</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--accent)', marginTop: '4px' }}>
            {numAgentCalls}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>subagent / runner dispatches</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Unresolved Calls</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--ink-secondary)', marginTop: '4px' }}>
            {numUnresolved}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>dynamic / stdlib / 3rd party</div>
        </div>
      </div>

      {/* View Switcher: Interaction Tree vs Function Explorer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-inset)', padding: '4px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setViewMode('tree')}
            style={{
              border: 'none',
              background: viewMode === 'tree' ? '#fff' : 'transparent',
              color: viewMode === 'tree' ? 'var(--ink-primary)' : 'var(--ink-muted)',
              fontWeight: viewMode === 'tree' ? 700 : 500,
              fontSize: '12.5px',
              padding: '6px 16px',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              boxShadow: viewMode === 'tree' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            Component Interaction Tree ({interactions.length})
          </button>
          <button
            onClick={() => setViewMode('explorer')}
            style={{
              border: 'none',
              background: viewMode === 'explorer' ? '#fff' : 'transparent',
              color: viewMode === 'explorer' ? 'var(--ink-primary)' : 'var(--ink-muted)',
              fontWeight: viewMode === 'explorer' ? 700 : 500,
              fontSize: '12.5px',
              padding: '6px 16px',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              boxShadow: viewMode === 'explorer' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            Caller / Callee Matrix ({filteredFunctions.length})
          </button>
        </div>

        {viewMode === 'tree' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="text"
              placeholder="Search steps, tools, subagents..."
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              style={{
                padding: '7px 14px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--border-default)',
                fontSize: '12px',
                fontFamily: 'var(--font-sans)',
                background: '#fff',
                outline: 'none',
                minWidth: '220px'
              }}
            />
            <button
              onClick={expandAll}
              style={{
                background: '#fff',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--ink-secondary)',
                cursor: 'pointer'
              }}
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              style={{
                background: '#fff',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--ink-secondary)',
                cursor: 'pointer'
              }}
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      {/* VIEW MODE 1: COMPONENT INTERACTION TREE */}
      {viewMode === 'tree' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Display Mode Sub-Switcher */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.04) 0%, rgba(59, 130, 246, 0.04) 100%)',
            border: '1.5px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px'
          }}>
            <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-inset)', padding: '4px', borderRadius: 'var(--radius-sm)' }}>
              <button
                onClick={() => setTreeDisplayType('canvas')}
                style={{
                  border: 'none',
                  background: treeDisplayType === 'canvas' ? '#fff' : 'transparent',
                  color: treeDisplayType === 'canvas' ? 'var(--ink-primary)' : 'var(--ink-muted)',
                  fontWeight: treeDisplayType === 'canvas' ? 700 : 500,
                  fontSize: '12px',
                  padding: '5px 14px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  boxShadow: treeDisplayType === 'canvas' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Node-Link Tree Canvas</span>
              </button>
              <button
                onClick={() => setTreeDisplayType('outline')}
                style={{
                  border: 'none',
                  background: treeDisplayType === 'outline' ? '#fff' : 'transparent',
                  color: treeDisplayType === 'outline' ? 'var(--ink-primary)' : 'var(--ink-muted)',
                  fontWeight: treeDisplayType === 'outline' ? 700 : 500,
                  fontSize: '12px',
                  padding: '5px 14px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  boxShadow: treeDisplayType === 'outline' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Hierarchical Outline</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px', color: 'var(--ink-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#3B82F6' }} />
                <span>[Root] AST Entry Handler</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8B5CF6' }} />
                <span>[Agent] ReAct Runner</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '4px', background: '#F59E0B' }} />
                <span>[Tool] Leaf Function</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748B' }} />
                <span>[Helper] Internal Function</span>
              </div>
            </div>
          </div>

          {/* SVG Canvas Mode - DYNAMIC RUNTIME COMPUTATION */}
          {treeDisplayType === 'canvas' && (
            <div className="interactive-inspector-grid" style={{ display: 'grid', gridTemplateColumns: selectedTreeNode ? 'minmax(0, 1.4fr) minmax(320px, 1fr)' : '1fr', gap: '20px', alignItems: 'start' }}>
              <div style={{
                background: '#fff',
                border: '1.5px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                boxShadow: 'var(--shadow-card)',
                overflowX: 'auto',
                textAlign: 'center'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-secondary)' }}>
                    Hierarchical Component & Execution Tree
                  </div>
                  {selectedTreeNode && (
                    <button
                      onClick={() => setSelectedTreeNode(null)}
                      style={{
                        background: 'var(--bg-inset)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '3px 8px',
                        fontSize: '11px',
                        color: 'var(--ink-muted)',
                        cursor: 'pointer'
                      }}
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                {filteredInteractions.length === 0 ? (
                  <div style={{ padding: '48px 20px', color: 'var(--ink-muted)' }}>
                    <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink-primary)' }}>No Component Interactions Recorded</p>
                    <p style={{ fontSize: '12px', marginTop: '4px' }}>Callgraph extraction did not identify step-level interaction trees.</p>
                  </div>
                ) : (() => {
                  const visibleInteractions = filteredInteractions.slice(0, treeLimit);
                  const isTruncated = filteredInteractions.length > treeLimit;

                  // Compute dynamic tree layout from visibleInteractions
                  const rootX = 20;
                  const stepX = 230;
                  const leafX = 450;
                  const stepWidth = 170;
                  const leafWidth = 520;
                  const leafHeight = 30;
                  const leafGap = 8;
                  const stepGap = 24;

                  let currentY = 40;
                  const stepLayouts = [];

                  visibleInteractions.forEach((item, sIdx) => {
                    // Gather leaf items: roots, tools, agents, functions
                    const leaves = [];
                    (item.roots || []).forEach(r => leaves.push({ type: 'root_fn', label: `[root] ${r}`, raw: r, file: r.split('::')[0] }));
                    (item.agents || []).forEach(a => leaves.push({ type: 'agent', label: `[agent] ${a} (Runner)`, raw: a, file: a.split('::')[0] }));
                    (item.tools || []).forEach(t => leaves.push({ type: 'tool', label: `[tool] ${t.name || t}()`, raw: t.name || t, path: t.path }));
                    (item.functions || []).forEach(f => leaves.push({ type: 'helper', label: `[helper] ${f}`, raw: f, file: f.split('::')[0] }));

                    const leavesCount = Math.max(1, leaves.length);
                    const blockHeight = leavesCount * (leafHeight + leafGap);
                    const stepY = currentY + (blockHeight / 2) - 26;

                    stepLayouts.push({
                      item,
                      stepIndex: sIdx,
                      stepY,
                      startY: currentY,
                      leaves,
                      blockHeight
                    });

                    currentY += blockHeight + stepGap;
                  });

                  const totalSvgHeight = Math.max(500, currentY + 40);
                  const rootY = totalSvgHeight / 2 - 25;
                  const agentDisplayName = callgraphData.agent || 'Agent Pipeline';

                  return (
                    <>
                      <svg
                      viewBox={`0 0 1020 ${totalSvgHeight}`}
                      style={{
                        width: '100%',
                        maxWidth: '960px',
                        height: 'auto',
                        minHeight: '520px',
                        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.03))'
                      }}
                    >
                      <defs>
                        <pattern id="tree-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                          <circle cx="12" cy="12" r="1" fill="#E2E8F0" />
                        </pattern>
                        <marker id="tree-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                          <path d="M 0 1 L 10 5 L 0 9 z" fill="#94A3B8" />
                        </marker>
                        <filter id="tree-shadow" x="-10%" y="-10%" width="120%" height="120%">
                          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0F172A" floodOpacity="0.06" />
                        </filter>
                        <filter id="tree-glow" x="-20%" y="-20%" width="140%" height="140%">
                          <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#EF4444" floodOpacity="0.4" />
                        </filter>
                      </defs>

                      <rect width="1020" height={totalSvgHeight} fill="#F8FAFC" rx="14" />
                      <rect width="1020" height={totalSvgHeight} fill="url(#tree-grid)" rx="14" />

                      {/* BRANCH BEZIER CURVES */}
                      {stepLayouts.map((sl, slIdx) => {
                        const targetStepY = sl.stepY + 26;
                        const rootMidY = rootY + 25;

                        return (
                          <g key={`curves-${slIdx}`}>
                            {/* Root -> Step */}
                            <path
                              d={`M ${rootX + 160} ${rootMidY} C ${rootX + 215} ${rootMidY}, ${stepX - 40} ${targetStepY}, ${stepX} ${targetStepY}`}
                              fill="none"
                              stroke="#94A3B8"
                              strokeWidth="2"
                              markerEnd="url(#tree-arrow)"
                            />

                            {/* Step -> Leaves */}
                            {sl.leaves.map((leaf, lIdx) => {
                              const leafY = sl.startY + lIdx * (leafHeight + leafGap) + leafHeight / 2;
                              return (
                                <path
                                  key={`leaf-curve-${lIdx}`}
                                  d={`M ${stepX + stepWidth} ${targetStepY} C ${stepX + stepWidth + 35} ${targetStepY}, ${leafX - 35} ${leafY}, ${leafX} ${leafY}`}
                                  fill="none"
                                  stroke="#CBD5E1"
                                  strokeWidth="1.5"
                                  markerEnd="url(#tree-arrow)"
                                />
                              );
                            })}
                          </g>
                        );
                      })}

                      {/* ROOT AGENT NODE */}
                      <g
                        transform={`translate(${rootX}, ${rootY})`}
                        onClick={() => setSelectedTreeNode({ type: 'root', name: agentDisplayName, description: 'Central Agent Application Pipeline' })}
                        style={{ cursor: 'pointer' }}
                      >
                        <rect width="160" height="50" rx="25" fill="#0F172A" stroke="#334155" strokeWidth="2" filter="url(#tree-shadow)" />
                        <circle cx="25" cy="25" r="7" fill="#EF4444" />
                        <text x="96" y="24" fill="#fff" fontSize="12" fontWeight="800" textAnchor="middle">
                          {agentDisplayName.length > 14 ? `${agentDisplayName.substring(0, 13)}…` : agentDisplayName}
                        </text>
                        <text x="96" y="38" fill="#94A3B8" fontSize="10" textAnchor="middle">
                          Agent Pipeline
                        </text>
                      </g>

                      {/* DYNAMIC STEP NODES & LEAF BOXES */}
                      {stepLayouts.map((sl, slIdx) => {
                        const isStepSelected = selectedTreeNode?.type === 'step' && selectedTreeNode?.name === sl.item.step;
                        const isGuardrail = sl.item.step.toLowerCase().includes('guard');
                        const isCritic = sl.item.step.toLowerCase().includes('critic');
                        const isAgent = sl.item.step.toLowerCase().includes('agent') || sl.item.tools?.length > 0;

                        const stepFill = isGuardrail ? '#FFFBEB' : isCritic ? '#FFFBEB' : isAgent ? '#EFF6FF' : '#F5F3FF';
                        const stepStroke = isStepSelected ? '#EF4444' : isGuardrail ? '#F59E0B' : isCritic ? '#D97706' : isAgent ? '#3B82F6' : '#8B5CF6';
                        const stepTextColor = isGuardrail ? '#78350F' : isCritic ? '#78350F' : isAgent ? '#1E3A8A' : '#4C1D95';

                        return (
                          <g key={`step-group-${slIdx}`}>
                            {/* Step Container */}
                            <g
                              transform={`translate(${stepX}, ${sl.stepY})`}
                              onClick={() => setSelectedTreeNode({
                                type: 'step',
                                name: sl.item.step,
                                step: sl.item.step,
                                roots: sl.item.roots || [],
                                tools: sl.item.tools?.map(t => t.name || t) || [],
                                functions: sl.item.functions || []
                              })}
                              style={{ cursor: 'pointer' }}
                            >
                              <rect
                                width={stepWidth}
                                height="52"
                                rx="10"
                                fill={stepFill}
                                stroke={stepStroke}
                                strokeWidth={isStepSelected ? '3' : '2'}
                                filter={isStepSelected ? 'url(#tree-glow)' : 'url(#tree-shadow)'}
                              />
                              <text x="24" y="24" fill={stepTextColor} fontSize="13" fontWeight="800" fontFamily="var(--font-mono)">
                                {sl.item.step}
                              </text>
                              <text x="24" y="39" fill={stepTextColor} fontSize="9.5" opacity="0.8">
                                Stage {slIdx + 1} · {sl.leaves.length} elements
                              </text>
                            </g>

                            {/* Leaves */}
                            {sl.leaves.map((leaf, lIdx) => {
                              const leafY = sl.startY + lIdx * (leafHeight + leafGap);
                              const isLeafSelected = selectedTreeNode?.name === leaf.raw;

                              const leafFill = leaf.type === 'root_fn' ? '#EFF6FF' : leaf.type === 'agent' ? '#FAF5FF' : leaf.type === 'tool' ? '#FFFBEB' : '#F8FAFC';
                              const leafStroke = isLeafSelected ? '#EF4444' : leaf.type === 'root_fn' ? '#3B82F6' : leaf.type === 'agent' ? '#8B5CF6' : leaf.type === 'tool' ? '#F59E0B' : '#CBD5E1';
                              const leafColor = leaf.type === 'root_fn' ? '#1E40AF' : leaf.type === 'agent' ? '#6D28D9' : leaf.type === 'tool' ? '#92400E' : '#334155';

                              return (
                                <g
                                  key={`leaf-box-${lIdx}`}
                                  transform={`translate(${leafX}, ${leafY})`}
                                  onClick={() => setSelectedTreeNode({
                                    type: leaf.type,
                                    name: leaf.raw,
                                    file: leaf.file,
                                    path: leaf.path
                                  })}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <rect
                                    width={leafWidth}
                                    height={leafHeight}
                                    rx="6"
                                    fill={leafFill}
                                    stroke={leafStroke}
                                    strokeWidth={isLeafSelected ? '2' : '1'}
                                  />
                                  <text x="12" y="19" fill={leafColor} fontSize="11" fontWeight="700" fontFamily="var(--font-mono)">
                                    {leaf.label.length > 56 ? `${leaf.label.substring(0, 54)}…` : leaf.label}
                                  </text>
                                  <title>{leaf.label}</title>
                                </g>
                              );
                            })}
                          </g>
                        );
                      })}
                    </svg>
                    {filteredInteractions.length > 25 && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        marginTop: '12px',
                        background: 'var(--bg-surface-soft)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)'
                      }}>
                        <span style={{ fontSize: '12px', color: 'var(--ink-secondary)', fontWeight: 600 }}>
                          Showing {visibleInteractions.length} of {filteredInteractions.length} interaction steps
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {isTruncated && (
                            <button
                              onClick={() => setTreeLimit(prev => Math.min(prev + 25, filteredInteractions.length))}
                              style={{
                                padding: '5px 12px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                background: '#fff',
                                border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                color: 'var(--ink-primary)'
                              }}
                            >
                              Show More (+25)
                            </button>
                          )}
                          {isTruncated && (
                            <button
                              onClick={() => setTreeLimit(filteredInteractions.length)}
                              style={{
                                padding: '5px 12px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                background: 'var(--accent)',
                                border: 'none',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                color: '#fff'
                              }}
                            >
                              Show All ({filteredInteractions.length})
                            </button>
                          )}
                          {treeLimit > 25 && (
                            <button
                              onClick={() => setTreeLimit(25)}
                              style={{
                                padding: '5px 12px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                background: 'transparent',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                color: 'var(--ink-muted)'
                              }}
                            >
                              Reset to 25
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                  );
                })()}
              </div>

              {/* Node Inspector Panel */}
              {selectedTreeNode && (
                <div style={{
                  background: '#fff',
                  border: '1.5px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '24px',
                  boxShadow: 'var(--shadow-card)',
                  position: 'sticky',
                  top: '20px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        Selected Tree Component
                      </span>
                      <h3 style={{
                        fontSize: '16px',
                        fontWeight: 800,
                        color: 'var(--ink-primary)',
                        fontFamily: 'var(--font-mono)',
                        margin: '4px 0 0',
                        wordBreak: 'break-all',
                        overflowWrap: 'anywhere',
                        lineHeight: 1.35
                      }}>
                        {selectedTreeNode.name}
                      </h3>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink-muted)', marginTop: '2px' }}>
                        Type: <strong style={{ color: 'var(--ink-secondary)' }}>{selectedTreeNode.type}</strong>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedTreeNode(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        fontSize: '16px',
                        cursor: 'pointer',
                        color: 'var(--ink-muted)'
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {selectedTreeNode.file && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Source Location</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink-primary)', marginTop: '2px', wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                        {selectedTreeNode.file}{selectedTreeNode.line ? ` : line ${selectedTreeNode.line}` : ''}
                      </div>
                    </div>
                  )}

                  {selectedTreeNode.path && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#B45309', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Multi-Hop Invocation Chain
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                        {selectedTreeNode.path.map((p, pi) => (
                          <React.Fragment key={pi}>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10.5px',
                              background: pi === selectedTreeNode.path.length - 1 ? '#FDE68A' : 'var(--bg-inset)',
                              border: '1px solid var(--border-subtle)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              color: 'var(--ink-primary)',
                              fontWeight: pi === selectedTreeNode.path.length - 1 ? 800 : 500
                            }}>
                              {p}
                            </span>
                            {pi < selectedTreeNode.path.length - 1 && <span style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>➔</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedTreeNode.tools && selectedTreeNode.tools.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Associated Tools</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {selectedTreeNode.tools.map((t, ti) => (
                          <span key={ti} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: '#FFFBEB', border: '1px solid #FDE68A', padding: '3px 8px', borderRadius: '4px', color: '#92400E', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedTreeNode.functions && selectedTreeNode.functions.length > 0 && (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Sub-Functions</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                        {selectedTreeNode.functions.map((fn, fni) => (
                          <span key={fni} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-secondary)' }}>
                            • {fn}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Detailed Outline Mode */}
          {treeDisplayType === 'outline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredInteractions.length === 0 ? (
                <div style={{ background: '#fff', padding: '36px', textAlign: 'center', borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)' }}>
                  <div style={{ marginBottom: '8px', color: 'var(--ink-muted)' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto', display: 'block' }}>
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink-primary)' }}>No Interaction Steps Matched</div>
                  <p style={{ fontSize: '12.5px', color: 'var(--ink-muted)', marginTop: '4px' }}>Try searching for a different keyword or clear your filter.</p>
                </div>
              ) : (
                filteredInteractions.map((item, idx) => {
                  const isExpanded = expandedSteps.has(idx);
                  const toolCount = item.tools?.length || 0;
                  const agentCount = item.agents?.length || 0;
                  const funcCount = item.functions?.length || 0;

                  return (
                <div
                  key={idx}
                  style={{
                    background: '#fff',
                    border: '1.5px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-card)',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  {/* Step Header (Click to toggle) */}
                  <div
                    onClick={() => toggleStep(idx)}
                    style={{
                      padding: '16px 20px',
                      background: isExpanded ? 'var(--bg-surface-soft)' : '#fff',
                      borderBottom: isExpanded ? '1px solid var(--border-default)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: 800,
                        background: 'var(--accent)',
                        color: '#fff',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {idx + 1}
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink-primary)', fontFamily: 'var(--font-mono)' }}>
                            {item.step}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>execution step</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {toolCount > 0 && (
                        <span style={{ fontSize: '11px', background: '#FEF3C7', color: '#92400E', padding: '3px 9px', borderRadius: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                          {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
                        </span>
                      )}
                      {agentCount > 0 && (
                        <span style={{ fontSize: '11px', background: '#DBEAFE', color: '#1E40AF', padding: '3px 9px', borderRadius: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
                          {agentCount} subagent
                        </span>
                      )}
                      <span style={{ fontSize: '11px', background: 'var(--bg-inset)', color: 'var(--ink-secondary)', padding: '3px 9px', borderRadius: '12px', fontWeight: 600 }}>
                        {funcCount} helper {funcCount === 1 ? 'function' : 'functions'}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--ink-muted)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
                        ▼
                      </span>
                    </div>
                  </div>

                  {/* Expanded Tree Branches */}
                  {isExpanded && (
                    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                      {/* Branch 1: LangGraph Root Handler */}
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--accent)' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="12 8 8 12 12 16 16 12 12 8"/></svg>
                          </span>
                          LangGraph Node Entry Point (Roots)
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {item.roots && item.roots.length > 0 ? (
                            item.roots.map((root, ri) => (
                              <div
                                key={ri}
                                onClick={() => {
                                  setSelectedFuncId(root);
                                  setViewMode('explorer');
                                }}
                                style={{
                                  background: 'var(--bg-inset)',
                                  border: '1.5px solid var(--border-default)',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                  color: 'var(--ink-primary)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                title="Click to view function call graph details"
                              >
                                <span>{root}</span>
                                <span style={{ fontSize: '10px', color: 'var(--accent)' }}>↗ trace</span>
                              </div>
                            ))
                          ) : (
                            <div style={{ fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>None specified</div>
                          )}
                        </div>
                      </div>

                      {/* Branch 2: Subagents Dispatched */}
                      {agentCount > 0 && (
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
                            </span>
                            Subagents Instantiated
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {item.agents.map((agent, ai) => (
                              <div
                                key={ai}
                                style={{
                                  background: '#EFF6FF',
                                  border: '1px solid #BFDBFE',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  fontFamily: 'var(--font-mono)',
                                  color: '#1E40AF',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                              >
                                <span>{agent}</span>
                                <span style={{ fontSize: '10px', background: '#DBEAFE', padding: '1px 5px', borderRadius: '3px' }}>ReAct Runner</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Branch 3: Tool Invocations & Multi-Hop Call Chain */}
                      {toolCount > 0 && (
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                            </span>
                            Tool Invocations & Multi-Hop Call Chains ({toolCount})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {item.tools.map((t, ti) => (
                              <div
                                key={ti}
                                style={{
                                  background: '#FFFBEB',
                                  border: '1px solid #FDE68A',
                                  borderRadius: '8px',
                                  padding: '12px 16px'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#92400E', fontFamily: 'var(--font-mono)' }}>
                                      {t.name}()
                                    </span>
                                    <span style={{ fontSize: '10px', background: '#FEF3C7', border: '1px solid #FDE68A', padding: '1px 6px', borderRadius: '4px', color: '#B45309', fontWeight: 700 }}>
                                      Tool Leaf Node
                                    </span>
                                  </div>
                                </div>

                                {/* Call Path Chain */}
                                {t.path && t.path.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: '10.5px', color: '#B45309', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase' }}>
                                      Invocation Call Chain:
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                                      {t.path.map((step, si) => (
                                        <React.Fragment key={si}>
                                          <span style={{
                                            fontSize: '11px',
                                            fontFamily: 'var(--font-mono)',
                                            background: si === t.path.length - 1 ? '#FDE68A' : '#fff',
                                            border: '1px solid #FCD34D',
                                            padding: '3px 8px',
                                            borderRadius: '4px',
                                            color: '#78350F',
                                            fontWeight: si === t.path.length - 1 ? 800 : 500
                                          }}>
                                            {step}
                                          </span>
                                          {si < t.path.length - 1 && (
                                            <span style={{ fontSize: '10px', color: '#D97706', fontWeight: 700 }}>➔</span>
                                          )}
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Branch 4: Internal Helpers */}
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--ink-secondary)' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                          </span>
                          Internal Functions Resolved ({funcCount})
                        </div>
                        {funcCount === 0 ? (
                          <div style={{ fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                            Direct terminal action (no additional intra-repo helper functions).
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {item.functions.map((fn, fi) => (
                              <span
                                key={fi}
                                onClick={() => {
                                  setSelectedFuncId(fn);
                                  setViewMode('explorer');
                                }}
                                style={{
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                  background: 'var(--bg-surface-soft)',
                                  border: '1px solid var(--border-subtle)',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  color: 'var(--ink-primary)',
                                  cursor: 'pointer'
                                }}
                                title="Click to view in function explorer"
                              >
                                {fn}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: CALLER / CALLEE EXPLORER */}
      {viewMode === 'explorer' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.2fr)', gap: '20px', alignItems: 'start' }}>
          {/* Left Column: Function Explorer with Filters */}
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)', padding: '20px', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink-primary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Functions ({filteredFunctions.length})
              </h3>
              <select
                value={filterFile}
                onChange={(e) => {
                  setFilterFile(e.target.value);
                  setFunctionPage(1);
                }}
                style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface-soft)',
                  cursor: 'pointer'
                }}
              >
                {files.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <input
              type="text"
              placeholder="Search function name or docstring..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setFunctionPage(1);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                fontSize: '12px',
                fontFamily: 'var(--font-sans)',
                outline: 'none'
              }}
            />
          </div>

          {(() => {
            const totalFunctionPages = Math.ceil(filteredFunctions.length / FUNCTIONS_PER_PAGE) || 1;
            const currentFunctionPage = Math.min(functionPage, totalFunctionPages);
            const visibleFunctions = filteredFunctions.slice(
              (currentFunctionPage - 1) * FUNCTIONS_PER_PAGE,
              currentFunctionPage * FUNCTIONS_PER_PAGE
            );

            return (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '560px', overflowY: 'auto' }}>
                  {visibleFunctions.map(func => {
                    const isSelected = selectedFuncId === func.id;
                    const hasOut = edges.some(e => e.from === func.id);
                    const hasIn = edges.some(e => e.to === func.id);

                    return (
                      <div
                        key={func.id}
                        onClick={() => setSelectedFuncId(func.id)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-sm)',
                          border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                          background: isSelected ? 'var(--accent-light)' : 'var(--bg-surface-soft)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <code style={{ fontSize: '12.5px', fontWeight: 800, color: isSelected ? 'var(--accent)' : 'var(--ink-primary)' }}>
                            {func.name}
                          </code>
                          <span style={{ fontSize: '10px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
                            L{func.start}–{func.end}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                            {func.file}
                          </span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {hasIn && <span style={{ fontSize: '9px', background: '#DCFCE7', color: '#16A34A', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>callee</span>}
                            {hasOut && <span style={{ fontSize: '9px', background: '#E0F2FE', color: '#0284C7', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>caller</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {totalFunctionPages > 1 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '12px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: '11.5px',
                    color: 'var(--ink-secondary)'
                  }}>
                    <span>
                      Page {currentFunctionPage} of {totalFunctionPages} ({filteredFunctions.length} total)
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        disabled={currentFunctionPage <= 1}
                        onClick={() => setFunctionPage(prev => Math.max(1, prev - 1))}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-default)',
                          background: currentFunctionPage <= 1 ? 'var(--bg-inset)' : '#fff',
                          color: currentFunctionPage <= 1 ? 'var(--ink-faint)' : 'var(--ink-primary)',
                          cursor: currentFunctionPage <= 1 ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Prev
                      </button>
                      <button
                        disabled={currentFunctionPage >= totalFunctionPages}
                        onClick={() => setFunctionPage(prev => Math.min(totalFunctionPages, prev + 1))}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-default)',
                          background: currentFunctionPage >= totalFunctionPages ? 'var(--bg-inset)' : '#fff',
                          color: currentFunctionPage >= totalFunctionPages ? 'var(--ink-faint)' : 'var(--ink-primary)',
                          cursor: currentFunctionPage >= totalFunctionPages ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Right Column: Visual Relationship & Call Links */}
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
          {selectedFunc ? (
            <div>
              <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', marginBottom: '18px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Selected Function Node
                </span>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink-primary)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                  {selectedFunc.name}()
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {selectedFunc.file} : Lines {selectedFunc.start}–{selectedFunc.end}
                </div>
                {selectedFunc.docstring && (
                  <p style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', background: 'var(--bg-inset)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginTop: '12px', lineHeight: 1.5 }}>
                    {selectedFunc.docstring}
                  </p>
                )}
              </div>

              {/* Calls Outward */}
              <div style={{ marginBottom: '22px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink-primary)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>↗</span> Functions Called By This Node ({outgoingCalls.length})
                </h4>
                {outgoingCalls.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic', padding: '8px 0' }}>
                    No direct intra-repo function calls recorded from this function.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {outgoingCalls.map((edge, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedFuncId(edge.to)}
                        style={{
                          background: 'var(--bg-surface-soft)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <code style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                          {edge.to}
                        </code>
                        <span style={{ fontSize: '10.5px', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                          at line {edge.line}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Called By Inward */}
              <div>
                <h4 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink-primary)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>↙</span> Inward Callers Targeting This Node ({incomingCalls.length})
                </h4>
                {incomingCalls.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic', padding: '8px 0' }}>
                    Not directly called by other intra-repo functions (possible entry point, test, or API handler).
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {incomingCalls.map((edge, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedFuncId(edge.from)}
                        style={{
                          background: 'var(--bg-surface-soft)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <code style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>
                          {edge.from}
                        </code>
                        <span style={{ fontSize: '10.5px', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                          calls this at line {edge.line}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-muted)' }}>
              <div style={{ marginBottom: '12px', color: 'var(--ink-muted)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto', display: 'block' }}>
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink-primary)' }}>Select Any Function</div>
              <p style={{ fontSize: '12px', maxWidth: '300px', margin: '4px auto 0' }}>
                Click a function on the left to trace its callers, outgoing dependencies, and line-level invocation points.
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
