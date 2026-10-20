import React, { useState } from 'react';

export function ScanToolsView({ scanData, summaryData, onSelectTool }) {
  const [activeTab, setActiveTab] = useState('tools'); // 'tools' | 'flow' | 'nodes' | 'edges' | 'registrations'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNodeName, setSelectedNodeName] = useState(null);
  const [toolsLimit, setToolsLimit] = useState(24);

  if (!scanData) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '48px 24px', border: '1.5px solid var(--border-default)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink-primary)' }}>No AST Scan Data Available</h3>
          <p style={{ color: 'var(--ink-muted)', marginTop: '8px' }}>Run the scan stage or select an agent with completed outputs.</p>
        </div>
      </div>
    );
  }

  const tools = scanData.tools || [];
  const registrations = scanData.registrations || [];
  const graphNodes = scanData.nodes || scanData.graph_nodes || [];
  const graphEdges = scanData.edges || scanData.graph_edges || [];

  const filteredTools = tools.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.docstring && t.docstring.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
          <span>✦</span> Static Extraction (AST)
        </div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '30px', fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.6px' }}>
          Codebase Scan & Tools
        </h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '14.5px', marginTop: '4px' }}>
          Extracted definitions from Python <code>ast</code>: tools, tool registrations, LangGraph state nodes, and execution edges.
        </p>
      </div>

      {/* Metric Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '28px'
      }}>
        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Files Scanned</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '4px' }}>
            {scanData.files_scanned ?? 0}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>source files inspected</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Tools Extracted</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--accent)', marginTop: '4px' }}>
            {tools.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>callable agent functions</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Graph Nodes</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '4px' }}>
            {graphNodes.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>LangGraph workflow states</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Graph Edges</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '4px' }}>
            {graphEdges.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>state transitions & routes</div>
        </div>
      </div>

      {/* Tab Switcher & Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-inset)', padding: '4px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
          {[
            { id: 'tools', label: `Tools (${tools.length})` },
            { id: 'flow', label: `Route Flowchart (${graphNodes.length})` },
            { id: 'nodes', label: `State Nodes (${graphNodes.length})` },
            { id: 'edges', label: `Transitions (${graphEdges.length})` },
            { id: 'registrations', label: `Registrations (${registrations.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: 'none',
                background: activeTab === tab.id ? '#fff' : 'transparent',
                color: activeTab === tab.id ? 'var(--ink-primary)' : 'var(--ink-muted)',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: '12.5px',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
                boxShadow: activeTab === tab.id ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'tools' && (
          <input
            type="text"
            placeholder="Search tools or docstrings..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setToolsLimit(24);
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-default)',
              fontSize: '12.5px',
              fontFamily: 'var(--font-sans)',
              background: '#fff',
              outline: 'none',
              minWidth: '240px'
            }}
          />
        )}
      </div>

      {/* Route Flowchart Tab */}
      {activeTab === 'flow' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header Banner */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.04) 0%, rgba(249, 115, 22, 0.06) 100%)',
            border: '1.5px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
                  LangGraph State Machine Route Flowchart
                </h3>
                <span style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--accent-light)',
                  color: 'var(--accent)',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  {graphNodes.length} States · {graphEdges.length} Transitions
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--ink-secondary)', margin: 0 }}>
                Visualizes the sequential state pipeline, conditional routing guards, and self-correction loopbacks extracted from AST syntax trees in <code>graph.py</code>.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--ink-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)' }} />
                <span>Direct Route</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F59E0B' }} />
                <span>Conditional / Loopback</span>
              </div>
            </div>
          </div>

          {/* Interactive SVG Flowchart & Node Inspector 2-Column */}
          <div className="interactive-inspector-grid" style={{ display: 'grid', gridTemplateColumns: selectedNodeName ? 'minmax(0, 1.4fr) minmax(320px, 1fr)' : '1fr', gap: '20px', alignItems: 'start' }}>
            {/* Left: SVG Flowchart Canvas */}
            <div style={{
              background: '#fff',
              border: '1.5px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              boxShadow: 'var(--shadow-card)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                  </svg>
                  <span>Interactive State Diagram</span>
                  <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>(Click any node to inspect handler & transitions)</span>
                </div>
                {selectedNodeName && (
                  <button
                    onClick={() => setSelectedNodeName(null)}
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

              {/* Dynamic SVG Flowchart Canvas */}
              <div style={{ width: '100%', overflowX: 'auto', textAlign: 'center' }}>
                {graphNodes.length === 0 ? (
                  <div style={{ padding: '60px 20px', color: 'var(--ink-muted)' }}>
                    <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink-primary)' }}>No LangGraph States Detected</p>
                    <p style={{ fontSize: '13px', marginTop: '6px' }}>This agent does not define a compiled LangGraph state graph in its code.</p>
                  </div>
                ) : (() => {
                  const nodeSpacingY = 110;
                  const startY = 30;
                  const nodePositions = {};
                  const centerX = 360;
                  const nodeWidth = 260;
                  const nodeHeight = 64;

                  graphNodes.forEach((node, idx) => {
                    nodePositions[node.name] = {
                      x: centerX - nodeWidth / 2,
                      y: startY + (idx + 1) * nodeSpacingY,
                      w: nodeWidth,
                      h: nodeHeight,
                      index: idx
                    };
                  });

                  const totalHeight = startY + (graphNodes.length + 2) * nodeSpacingY + 40;
                  const firstNode = graphNodes[0];
                  const endY = startY + (graphNodes.length + 1) * nodeSpacingY;
                  const hasBlockedEnd = graphEdges.some(e => e.to === 'END' && e.conditional);

                  return (
                    <svg
                      viewBox={`0 0 860 ${totalHeight}`}
                      style={{
                        width: '100%',
                        maxWidth: '840px',
                        height: 'auto',
                        minHeight: '520px',
                        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.03))'
                      }}
                    >
                      <defs>
                        <pattern id="flow-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                          <circle cx="12" cy="12" r="1" fill="#E2E8F0" />
                        </pattern>
                        <marker id="arrow-direct" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 1 L 10 5 L 0 9 z" fill="#3B82F6" />
                        </marker>
                        <marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 1 L 10 5 L 0 9 z" fill="#10B981" />
                        </marker>
                        <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 1 L 10 5 L 0 9 z" fill="#F59E0B" />
                        </marker>
                        <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 1 L 10 5 L 0 9 z" fill="#EF4444" />
                        </marker>
                        <filter id="shadow-node" x="-10%" y="-10%" width="120%" height="120%">
                          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0F172A" floodOpacity="0.06" />
                        </filter>
                        <filter id="glow-selected" x="-20%" y="-20%" width="140%" height="140%">
                          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#EF4444" floodOpacity="0.4" />
                        </filter>
                      </defs>

                      {/* Canvas Grid Background */}
                      <rect width="860" height={totalHeight} fill="#F8FAFC" rx="14" />
                      <rect width="860" height={totalHeight} fill="url(#flow-grid)" rx="14" />

                      {/* START TERMINATOR */}
                      <g transform={`translate(${centerX - 75}, ${startY})`}>
                        <rect width="150" height="40" rx="20" fill="#10B981" stroke="#059669" strokeWidth="2" filter="url(#shadow-node)" />
                        <circle cx="24" cy="20" r="5" fill="#fff" />
                        <text x="84" y="25" fill="#fff" fontSize="12" fontWeight="800" textAnchor="middle" letterSpacing="0.8">
                          START
                        </text>
                      </g>

                      {/* Edge START -> First Node */}
                      {firstNode && nodePositions[firstNode.name] && (
                        <line
                          x1={centerX}
                          y1={startY + 40}
                          x2={centerX}
                          y2={nodePositions[firstNode.name].y - 2}
                          stroke="#10B981"
                          strokeWidth="2.5"
                          markerEnd="url(#arrow-green)"
                        />
                      )}

                      {/* DYNAMIC EDGES */}
                      {graphEdges.map((edge, eIdx) => {
                        const fromPos = nodePositions[edge.from];
                        const toPos = nodePositions[edge.to];

                        // Target is END
                        if (edge.to === 'END') {
                          if (!fromPos) return null;
                          if (edge.conditional) {
                            const exitY = fromPos.y + fromPos.h / 2;
                            return (
                              <g key={`edge-end-${eIdx}`}>
                                <path
                                  d={`M ${fromPos.x + fromPos.w} ${exitY} L 660 ${exitY}`}
                                  stroke="#EF4444"
                                  strokeWidth="2"
                                  strokeDasharray="4 3"
                                  markerEnd="url(#arrow-red)"
                                />
                                <rect x="530" y={exitY - 18} width="115" height="16" rx="3" fill="#FEE2E2" stroke="#FCA5A5" />
                                <text x="587" y={exitY - 6} fill="#DC2626" fontSize="9" fontWeight="700" textAnchor="middle">
                                  {edge.condition || 'conditional: blocked'}
                                </text>
                              </g>
                            );
                          } else {
                            return (
                              <line
                                key={`edge-end-${eIdx}`}
                                x1={centerX}
                                y1={fromPos.y + fromPos.h}
                                x2={centerX}
                                y2={endY - 2}
                                stroke="#10B981"
                                strokeWidth="2.5"
                                markerEnd="url(#arrow-green)"
                              />
                            );
                          }
                        }

                        // Target is another state node
                        if (fromPos && toPos) {
                          if (toPos.y < fromPos.y) {
                            const loopY1 = fromPos.y + fromPos.h / 2;
                            const loopY2 = toPos.y + toPos.h / 2;
                            return (
                              <g key={`edge-loop-${eIdx}`}>
                                <path
                                  d={`M ${fromPos.x} ${loopY1} C 90 ${loopY1}, 90 ${loopY2}, ${fromPos.x - 6} ${loopY2}`}
                                  fill="none"
                                  stroke="#F59E0B"
                                  strokeWidth="2.5"
                                  strokeDasharray="5 3"
                                  markerEnd="url(#arrow-amber)"
                                />
                                <g transform={`translate(40, ${(loopY1 + loopY2) / 2 - 14})`}>
                                  <rect width="130" height="26" rx="13" fill="#FFFBEB" stroke="#F59E0B" strokeWidth="1.5" />
                                  <text x="65" y="14" fill="#B45309" fontSize="9.5" fontWeight="800" textAnchor="middle">
                                    {edge.condition ? edge.condition : 'Loopback Route'}
                                  </text>
                                </g>
                              </g>
                            );
                          }

                          const startYLine = fromPos.y + fromPos.h;
                          const endYLine = toPos.y;
                          const isConditional = edge.conditional;

                          return (
                            <g key={`edge-${eIdx}`}>
                              <line
                                x1={centerX}
                                y1={startYLine}
                                x2={centerX}
                                y2={endYLine - 2}
                                stroke={isConditional ? '#F59E0B' : '#3B82F6'}
                                strokeWidth="2.5"
                                markerEnd={isConditional ? 'url(#arrow-amber)' : 'url(#arrow-direct)'}
                              />
                              {isConditional && (
                                <g>
                                  <rect x={centerX + 8} y={(startYLine + endYLine) / 2 - 9} width="95" height="18" rx="4" fill="#FEF3C7" stroke="#FDE68A" />
                                  <text x={centerX + 55} y={(startYLine + endYLine) / 2 + 3} fill="#92400E" fontSize="9.5" fontWeight="700" textAnchor="middle">
                                    {edge.condition || 'conditional'}
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        }

                        return null;
                      })}

                      {/* Blocked END node on the right if conditional exit to END exists */}
                      {hasBlockedEnd && (
                        <g transform={`translate(670, ${nodePositions[firstNode.name]?.y ? nodePositions[firstNode.name].y + 10 : 130})`}>
                          <rect width="130" height="40" rx="20" fill="#FEE2E2" stroke="#EF4444" strokeWidth="2" filter="url(#shadow-node)" />
                          <circle cx="20" cy="20" r="6" fill="none" stroke="#DC2626" strokeWidth="1.8" />
                          <line x1="16" y1="16" x2="24" y2="24" stroke="#DC2626" strokeWidth="1.8" />
                          <text x="74" y="24" fill="#991B1B" fontSize="11" fontWeight="800" textAnchor="middle">
                            END (Blocked)
                          </text>
                        </g>
                      )}

                      {/* DYNAMIC STATE MACHINE NODES */}
                      {graphNodes.map((node) => {
                        const pos = nodePositions[node.name];
                        if (!pos) return null;
                        const isSelected = selectedNodeName === node.name;

                        const isGuardrail = node.name.toLowerCase().includes('guard') || node.function?.toLowerCase().includes('guard');
                        const isCritic = node.name.toLowerCase().includes('critic') || node.function?.toLowerCase().includes('critic');
                        const isAgent = node.name.toLowerCase().includes('agent');

                        const badgeColor = isGuardrail ? '#FEF3C7' : isCritic ? '#FEF3C7' : isAgent ? '#DBEAFE' : '#F3E8FF';
                        const badgeTextColor = isGuardrail ? '#92400E' : isCritic ? '#B45309' : isAgent ? '#1E40AF' : '#6B21A8';
                        const badgeLabel = isGuardrail ? 'Guardrail' : isCritic ? 'Critic / Router' : isAgent ? 'Agent State' : 'Processor';
                        const strokeColor = isSelected ? '#EF4444' : isGuardrail ? '#F59E0B' : isCritic ? '#D97706' : isAgent ? '#3B82F6' : '#8B5CF6';

                        return (
                          <g
                            key={node.name}
                            transform={`translate(${pos.x}, ${pos.y})`}
                            onClick={() => setSelectedNodeName(isSelected ? null : node.name)}
                            style={{ cursor: 'pointer' }}
                          >
                            <rect
                              width={pos.w}
                              height={pos.h}
                              rx="12"
                              fill="#fff"
                              stroke={strokeColor}
                              strokeWidth={isSelected ? '3' : '2'}
                              filter={isSelected ? 'url(#glow-selected)' : 'url(#shadow-node)'}
                            />
                            <text x="20" y="25" fill="#0F172A" fontSize="13.5" fontWeight="800" fontFamily="var(--font-mono)">
                              {node.name}
                            </text>
                            <rect x={pos.w - 96} y="12" width="82" height="18" rx="4" fill={badgeColor} />
                            <text x={pos.w - 55} y="24" fill={badgeTextColor} fontSize="9.5" fontWeight="700" textAnchor="middle">
                              {badgeLabel}
                            </text>

                            <text x="20" y="44" fill="#475569" fontSize="11">
                              def {node.function || `${node.name}_node`}()
                            </text>
                            <text x="20" y="56" fill="#94A3B8" fontSize="9.5" fontFamily="var(--font-mono)">
                              {node.file}{node.line ? `:${node.line}` : ''}
                            </text>
                          </g>
                        );
                      })}

                      {/* END (SUCCESS) TERMINATOR */}
                      <g transform={`translate(${centerX - 75}, ${endY})`}>
                        <rect width="150" height="40" rx="20" fill="#10B981" stroke="#059669" strokeWidth="2" filter="url(#shadow-node)" />
                        <polyline points="18 20 23 25 30 15" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        <text x="84" y="25" fill="#fff" fontSize="12" fontWeight="800" textAnchor="middle" letterSpacing="0.8">
                          END (SUCCESS)
                        </text>
                      </g>
                    </svg>
                  );
                })()}
              </div>
            </div>

            {/* Right: Selected Node Inspector Panel */}
            {selectedNodeName && (() => {
              const selectedNode = graphNodes.find(n => n.name === selectedNodeName);
              const inEdges = graphEdges.filter(e => e.to === selectedNodeName);
              const outEdges = graphEdges.filter(e => e.from === selectedNodeName);

              return (
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
                        Selected State Node
                      </span>
                      <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink-primary)', fontFamily: 'var(--font-mono)', margin: '4px 0 0' }}>
                        {selectedNode?.name}
                      </h3>
                      <div style={{ fontSize: '12px', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        {selectedNode?.file} : line {selectedNode?.line}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedNodeName(null)}
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

                  {/* Target Handler */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Python AST Function
                    </div>
                    <div style={{ background: 'var(--bg-inset)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '12.5px', color: 'var(--ink-primary)' }}>
                      def {selectedNode?.function || selectedNode?.name}(state)
                    </div>
                  </div>

                  {/* Incoming Edges */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Inbound Transitions ({inEdges.length})
                    </div>
                    {inEdges.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                        Entry node (called on workflow initiation)
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {inEdges.map((e, i) => (
                          <div key={i} style={{ background: 'var(--bg-surface-soft)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>From: <strong>{e.from}</strong></span>
                            <span style={{ fontSize: '10.5px', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>{e.file}:{e.line}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Outgoing Edges */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Outbound Transitions ({outEdges.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {outEdges.map((e, i) => (
                        <div key={i} style={{ background: 'var(--bg-surface-soft)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '8px 10px', fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span>Target: <strong style={{ color: 'var(--accent)' }}>{e.to}</strong></span>
                            <span style={{
                              fontSize: '10px',
                              background: e.conditional ? '#FEF3C7' : 'var(--bg-inset)',
                              color: e.conditional ? '#92400E' : 'var(--ink-secondary)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontWeight: 600
                            }}>
                              {e.conditional ? 'conditional' : 'direct'}
                            </span>
                          </div>
                          {e.condition && (
                            <div style={{ fontSize: '11px', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                              Condition rule: {e.condition}
                            </div>
                          )}
                          <div style={{ fontSize: '10.5px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                            Configured at {e.file}:{e.line}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === 'tools' && (() => {
        const visibleTools = filteredTools.slice(0, toolsLimit);
        const isTruncated = filteredTools.length > toolsLimit;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
              {visibleTools.map((tool, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectTool && onSelectTool(tool)}
                  style={{
                    background: '#fff',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--border-default)',
                    padding: '20px',
                    boxShadow: 'var(--shadow-card)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, border-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <code style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink-primary)' }}>
                        {tool.name}()
                      </code>
                      <span style={{
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        background: 'var(--bg-inset)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        color: 'var(--ink-secondary)'
                      }}>
                        {tool.detected_by || 'decorator:tool'}
                      </span>
                    </div>

                    <p style={{
                      fontSize: '12.5px',
                      color: 'var(--ink-secondary)',
                      lineHeight: 1.5,
                      marginBottom: '14px',
                      minHeight: '38px'
                    }}>
                      {tool.docstring || 'No docstring provided in code.'}
                    </p>
                  </div>

                  <div>
                    {/* Arguments */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Parameters ({tool.args ? tool.args.length : 0})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {tool.args && tool.args.length > 0 ? (
                          tool.args.map((arg, aidx) => (
                            <span key={aidx} style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              background: 'var(--bg-surface-soft)',
                              border: '1px solid var(--border-subtle)',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              color: 'var(--ink-primary)'
                            }}>
                              {arg}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>None</span>
                        )}
                      </div>
                    </div>

                    {/* File Reference */}
                    <div style={{
                      borderTop: '1px dashed var(--border-subtle)',
                      paddingTop: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: 'var(--ink-muted)',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      <span>{tool.file}</span>
                      <span>Lines {tool.start_line}–{tool.end_line}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredTools.length > 24 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                background: '#fff',
                border: '1.5px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <span style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', fontWeight: 600 }}>
                  Showing {visibleTools.length} of {filteredTools.length} tools
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {isTruncated && (
                    <button
                      onClick={() => setToolsLimit(prev => Math.min(prev + 24, filteredTools.length))}
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: '#fff',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        color: 'var(--ink-primary)'
                      }}
                    >
                      Show More (+24)
                    </button>
                  )}
                  {isTruncated && (
                    <button
                      onClick={() => setToolsLimit(filteredTools.length)}
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: 'var(--accent)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        color: '#fff'
                      }}
                    >
                      Show All ({filteredTools.length})
                    </button>
                  )}
                  {toolsLimit > 24 && (
                    <button
                      onClick={() => setToolsLimit(24)}
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        color: 'var(--ink-muted)'
                      }}
                    >
                      Reset to 24
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === 'nodes' && (
        <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-default)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Node Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Target Function</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Defined In</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Line</th>
                </tr>
              </thead>
              <tbody>
                {graphNodes.map((n, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{n.name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink-secondary)' }}><code>{n.function || n.name}</code></td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>{n.file}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>{n.line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'edges' && (
        <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-default)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>From State</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>To State</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Type</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {graphEdges.map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{e.from}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{e.to}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {(() => {
                        const isCond = e.conditional === true || e.kind === 'conditional';
                        return (
                          <span style={{
                            fontSize: '11px',
                            background: isCond ? '#FEF3C7' : 'var(--bg-inset)',
                            color: isCond ? '#92400E' : 'var(--ink-secondary)',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontWeight: 600
                          }}>
                            {isCond ? 'conditional' : (e.kind || 'direct')}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>{e.file}:{e.line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'registrations' && (
        <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '14px', color: 'var(--ink-primary)' }}>Tool Registrations via Agent Constructors</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {registrations.map((r, i) => (
              <div key={i} style={{ background: 'var(--bg-surface-soft)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--ink-primary)' }}><code>{r.call}</code></span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)' }}>{r.file}:{r.line}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>Registered Tools:</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {r.tools.map((tname, tidx) => (
                    <span key={tidx} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: '#fff', border: '1px solid var(--border-default)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                      {tname}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
