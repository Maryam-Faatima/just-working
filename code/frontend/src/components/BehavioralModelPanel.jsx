import React from 'react';

export function BehavioralModelPanel({ capabilities, metrics, onInspectCap }) {
  const capList = Object.values(capabilities);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return { label: 'CONFIRMED', bg: 'var(--status-confirmed-bg)', color: 'var(--status-confirmed)', border: 'var(--status-confirmed-border)' };
      case 'contradicted':
        return { label: 'CONTRADICTED', bg: 'var(--status-contradicted-bg)', color: 'var(--status-contradicted)', border: 'var(--status-contradicted-border)' };
      case 'discovered':
        return { label: 'DISCOVERED', bg: 'var(--status-discovered-bg)', color: 'var(--status-discovered)', border: 'var(--status-discovered-border)' };
      default:
        return { label: 'UNVERIFIED', bg: 'var(--status-unverified-bg)', color: 'var(--status-unverified)', border: 'var(--status-unverified-border)' };
    }
  };

  const getBarColor = (status) => {
    switch (status) {
      case 'confirmed': return 'var(--status-confirmed)';
      case 'contradicted': return 'var(--status-contradicted)';
      case 'discovered': return 'var(--status-discovered)';
      default: return 'var(--status-unverified)';
    }
  };

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
            M
          </div>
          <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink-primary)' }}>
            Behavioral Model
          </h2>
        </div>
        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)', background: 'var(--bg-inset)', padding: '2px 6px', borderRadius: '4px' }}>
          V0 Engine
        </span>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        fontSize: '11px',
        color: 'var(--ink-muted)',
        marginBottom: '16px',
        paddingBottom: '10px',
        borderBottom: '1px dashed var(--border-default)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--status-unverified)' }} />
          unverified
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--status-confirmed)' }} />
          confirmed
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--status-contradicted)' }} />
          contradicted
        </div>
      </div>

      {/* Capabilities List */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
        {capList.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--ink-muted)',
            fontStyle: 'italic',
            padding: '24px 0'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#000',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '10px'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="6" x2="12" y2="12" />
                <line x1="12" y1="12" x2="16" y2="14" />
              </svg>
            </div>
            <span>Parsing repository source files...</span>
            <span style={{ fontSize: '11px', color: 'var(--ink-faint)', fontStyle: 'normal', marginTop: '4px' }}>
              Model entries will synthesize once testing initiates.
            </span>
          </div>
        ) : (
          capList.map((cap) => {
            const badge = getStatusBadge(cap.status);
            const confPct = Math.round((cap.confidence || 0) * 100);
            return (
              <div
                key={cap.id}
                onClick={() => onInspectCap(cap)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface-soft)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: 'var(--ink-primary)'
                  }}>
                    {cap.name || cap.id || 'cancel_booking'}
                  </span>
                  <span style={{
                    fontSize: '9.5px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: badge.bg,
                    color: badge.color,
                    border: `1px solid ${badge.border}`
                  }}>
                    {badge.label}
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{
                  height: '5px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--bg-sand)',
                  overflow: 'hidden',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${confPct}%`,
                    backgroundColor: getBarColor(cap.status),
                    borderRadius: 'var(--radius-full)',
                    transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease'
                  }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                  <span style={{ color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                    Confidence {confPct}%
                  </span>
                  <span style={{ color: 'var(--ink-faint)', fontSize: '10.5px' }}>
                    {cap.evidence ? cap.evidence[0]?.file ? `${cap.evidence[0].file}` : 'Runtime evidence' : 'Code'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Metrics Footer */}
      <div style={{
        marginTop: '16px',
        paddingTop: '14px',
        borderTop: '1px dashed var(--border-default)',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        textAlign: 'center'
      }}>
        <div style={{ background: 'var(--bg-surface-soft)', padding: '8px 4px', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink-primary)', fontFamily: 'var(--font-mono)' }}>
            {metrics.testsExecuted ?? 0}/{metrics.testsTotal || 4}
          </div>
          <div style={{ fontSize: '9.5px', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Tests Ran
          </div>
        </div>
        <div style={{ background: 'var(--bg-surface-soft)', padding: '8px 4px', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--status-contradicted)', fontFamily: 'var(--font-mono)' }}>
            {metrics.contradictions ?? 0}
          </div>
          <div style={{ fontSize: '9.5px', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Violations
          </div>
        </div>
        <div style={{ background: 'var(--bg-surface-soft)', padding: '8px 4px', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            {metrics.coveragePct ?? 0}%
          </div>
          <div style={{ fontSize: '9.5px', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Coverage
          </div>
        </div>
      </div>
    </section>
  );
}
