import React from 'react';

export function EvidenceGraphPanel() {
  return (
    <section style={{
      background: '#fff',
      borderRadius: 'var(--radius-lg)',
      border: '1.5px solid var(--border-default)',
      padding: '20px',
      boxShadow: 'var(--shadow-card)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '520px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '14px',
        paddingBottom: '10px',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: 'var(--ink-primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 800
          }}>
            G
          </div>
          <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink-primary)' }}>
            Evidence Graph
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#92400E', background: '#FEF3C7', border: '1px solid #F59E0B', padding: '2px 7px', borderRadius: '4px' }}>
            SIMULATION (mock data)
          </span>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)', background: 'var(--bg-inset)', padding: '2px 6px', borderRadius: '4px' }}>
            AST & RUNTIME GRAPH
          </span>
        </div>
      </div>

      <p style={{ fontSize: '11px', color: 'var(--ink-muted)', marginBottom: '14px' }}>
        Traceable proof graph linking static code AST claims to execution traces and test findings.
      </p>

      {/* Clean Placeholder Body (No fake hardcoded SVG graph) */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-surface-soft)',
        borderRadius: 'var(--radius-md)',
        border: '1.5px dashed var(--border-default)',
        padding: '36px 20px',
        textAlign: 'center'
      }}>
        <div style={{
          width: '46px',
          height: '46px',
          borderRadius: '12px',
          background: 'var(--bg-inset)',
          color: 'var(--ink-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '14px',
          border: '1px solid var(--border-default)'
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M6 9v6M9 6h6M18 9v6" />
          </svg>
        </div>

        <div style={{
          fontSize: '13.5px',
          fontWeight: 700,
          color: 'var(--ink-primary)',
          marginBottom: '6px'
        }}>
          Evidence Graph Not Generated
        </div>

        <p style={{
          fontSize: '11.5px',
          color: 'var(--ink-muted)',
          maxWidth: '230px',
          lineHeight: 1.5,
          margin: 0
        }}>
          The graph will be synthesized once Phase 3 (<code>evidence/report.py</code>) runs on the backend.
        </p>
      </div>
    </section>
  );
}
