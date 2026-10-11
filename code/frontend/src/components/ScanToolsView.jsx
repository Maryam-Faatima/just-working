import React, { useState } from 'react';

export function ScanToolsView({ scanData, summaryData, onSelectTool }) {
  const [activeTab, setActiveTab] = useState('tools'); // 'tools' | 'nodes' | 'edges' | 'registrations'
  const [searchTerm, setSearchTerm] = useState('');

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
  const graphNodes = scanData.graph_nodes || [];
  const graphEdges = scanData.graph_edges || [];

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
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-inset)', padding: '4px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)' }}>
          {[
            { id: 'tools', label: `Tools (${tools.length})` },
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
            onChange={(e) => setSearchTerm(e.target.value)}
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

      {/* Main Tab Content */}
      {activeTab === 'tools' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {filteredTools.map((tool, idx) => (
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
      )}

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
                      <span style={{ fontSize: '11px', background: e.kind === 'conditional' ? '#FEF3C7' : 'var(--bg-inset)', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>
                        {e.kind || 'direct'}
                      </span>
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
