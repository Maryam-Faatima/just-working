import React, { useState, useMemo } from 'react';

export function CallGraphView({ callgraphData, onSelectFunction }) {
  const [filterFile, setFilterFile] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFuncId, setSelectedFuncId] = useState(null);

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
  const agentCalls = callgraphData.agent_calls || [];
  const unresolved = callgraphData.unresolved_calls || [];

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

  // Selected Function Relationships
  const selectedFunc = functions.find(f => f.id === selectedFuncId);
  const outgoingCalls = edges.filter(e => e.from === selectedFuncId);
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
          Inter-Function Call Graph & Flow
        </h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '14.5px', marginTop: '4px' }}>
          Direct caller-callee resolution from AST syntax trees linking entry points, node routers, tools, and vector retrievals.
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
            {functions.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>declared in codebase</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--status-confirmed)', textTransform: 'uppercase' }}>Resolved Calls</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--status-confirmed)', marginTop: '4px' }}>
            {edges.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>direct AST function links</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Agent Invocations</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--accent)', marginTop: '4px' }}>
            {agentCalls.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>subagent / runner dispatches</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Unresolved Calls</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--ink-secondary)', marginTop: '4px' }}>
            {unresolved.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>dynamic / stdlib / 3rd party</div>
        </div>
      </div>

      {/* 2-Column Responsive Layout: Left list, Right relationship inspection */}
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
                onChange={(e) => setFilterFile(e.target.value)}
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
              onChange={(e) => setSearchQuery(e.target.value)}
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '560px', overflowY: 'auto' }}>
            {filteredFunctions.map(func => {
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
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink-primary)' }}>Select Any Function</div>
              <p style={{ fontSize: '12px', maxWidth: '300px', margin: '4px auto 0' }}>
                Click a function on the left to trace its callers, outgoing dependencies, and line-level invocation points.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
