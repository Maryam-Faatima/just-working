import React, { useState } from 'react';

export function BehavioralModelView({ modelData, onSelectEntry }) {
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'capability' | 'workflow'
  const [searchQuery, setSearchQuery] = useState('');

  if (!modelData) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '48px 24px', border: '1.5px solid var(--border-default)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink-primary)' }}>No Behavioral Model Data</h3>
          <p style={{ color: 'var(--ink-muted)', marginTop: '8px' }}>Model V0 has not been synthesized yet for this agent.</p>
        </div>
      </div>
    );
  }

  const entries = modelData.entries || [];
  const capabilities = entries.filter(e => e.type === 'capability');
  const workflows = entries.filter(e => e.type === 'workflow');

  const filteredEntries = entries.filter(e => {
    const matchType = filterType === 'ALL' || e.type === filterType;
    const matchSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchType && matchSearch;
  });

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
          <span>✦</span> Behavioral Model V0
        </div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '30px', fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.6px' }}>
          Extracted Capabilities & Workflow Constraints
        </h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '14.5px', marginTop: '4px' }}>
          Synthesized claims from rule-based AST scanner + LLM inference cross-checking, with evidence anchored in repository code.
        </p>
      </div>

      {/* Metrics Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '28px'
      }}>
        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Capabilities</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--accent)', marginTop: '4px' }}>
            {capabilities.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>functional actions & tools</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Workflow States</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '4px' }}>
            {workflows.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>orchestration nodes & guardrails</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Total Inferred Constraints</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '4px' }}>
            {entries.reduce((acc, e) => acc + (e.constraints ? e.constraints.length : 0), 0)}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>rules extracted by LLM & AST</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--status-confirmed)', textTransform: 'uppercase' }}>Model Version</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--status-confirmed)', marginTop: '4px' }}>
            {modelData.version || 'v0'}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>initial pre-execution baseline</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
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
            { id: 'ALL', label: `All Entries (${entries.length})` },
            { id: 'capability', label: `Capabilities (${capabilities.length})` },
            { id: 'workflow', label: `Workflow States (${workflows.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              style={{
                border: 'none',
                background: filterType === tab.id ? '#fff' : 'transparent',
                color: filterType === tab.id ? 'var(--ink-primary)' : 'var(--ink-muted)',
                fontWeight: filterType === tab.id ? 700 : 500,
                fontSize: '12.5px',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
                boxShadow: filterType === tab.id ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Filter by capability or workflow..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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
      </div>

      {/* Entries Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
        {filteredEntries.map(entry => {
          const isCap = entry.type === 'capability';
          const confPct = Math.round((entry.confidence || 0) * 100);

          return (
            <div
              key={entry.id}
              onClick={() => onSelectEntry && onSelectEntry(entry)}
              style={{
                background: '#fff',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border-default)',
                padding: '20px',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 800,
                      background: 'var(--bg-inset)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      color: 'var(--ink-secondary)'
                    }}>
                      {entry.id}
                    </span>
                    <span style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: isCap ? 'var(--accent-light)' : '#E0F2FE',
                      color: isCap ? 'var(--accent)' : '#0284C7'
                    }}>
                      {entry.type}
                    </span>
                  </div>

                  <span style={{
                    fontSize: '10.5px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: 'var(--ink-muted)'
                  }}>
                    {entry.detected_by}
                  </span>
                </div>

                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink-primary)', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                  {entry.name}
                </h3>

                <p style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', lineHeight: 1.5, marginBottom: '14px' }}>
                  {entry.description}
                </p>

                {/* Constraints list if any */}
                {entry.constraints && entry.constraints.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Identified Constraints ({entry.constraints.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {entry.constraints.map((c, cidx) => (
                        <div
                          key={cidx}
                          style={{
                            fontSize: '11.5px',
                            color: 'var(--ink-primary)',
                            background: 'var(--bg-surface-soft)',
                            border: '1px solid var(--border-subtle)',
                            padding: '6px 10px',
                            borderRadius: '4px',
                            lineHeight: 1.4
                          }}
                        >
                          • {c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Confidence Bar & File Anchoring */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--ink-muted)' }}>Confidence</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--ink-primary)' }}>{confPct}%</span>
                </div>
                <div style={{ width: '100%', height: '5px', background: 'var(--bg-inset)', borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
                  <div style={{ width: `${confPct}%`, height: '100%', background: isCap ? 'var(--accent)' : '#0284C7', borderRadius: '3px' }} />
                </div>

                {entry.evidence && entry.evidence.length > 0 && (
                  <div style={{
                    borderTop: '1px dashed var(--border-subtle)',
                    paddingTop: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '10.5px',
                    color: 'var(--ink-muted)',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    <span>{entry.evidence[0].file}</span>
                    <span>L{entry.evidence[0].lines}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
