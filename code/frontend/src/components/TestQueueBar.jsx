import React from 'react';

export function TestQueueBar({ testQueue, metrics, onInspectTest }) {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'running': return '●';
      case 'passed': return '✓';
      case 'failed': return '✕';
      case 'discovered': return '★';
      default: return '○';
    }
  };

  const getStatusStyles = (status) => {
    switch (status) {
      case 'running':
        return {
          bg: 'var(--accent-light)',
          color: 'var(--accent)',
          border: '1.5px solid var(--accent)'
        };
      case 'passed':
        return {
          bg: 'var(--status-confirmed-bg)',
          color: 'var(--status-confirmed)',
          border: '1.5px solid var(--status-confirmed-border)'
        };
      case 'failed':
        return {
          bg: 'var(--status-contradicted-bg)',
          color: 'var(--status-contradicted)',
          border: '1.5px solid var(--status-contradicted-border)'
        };
      case 'discovered':
        return {
          bg: 'var(--status-discovered-bg)',
          color: 'var(--status-discovered)',
          border: '1.5px solid var(--status-discovered-border)'
        };
      default:
        return {
          bg: '#fff',
          color: 'var(--ink-muted)',
          border: '1.5px dashed var(--border-default)'
        };
    }
  };

  return (
    <div style={{
      maxWidth: '1440px',
      margin: '16px auto 0 auto',
      padding: '0 24px'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 'var(--radius-lg)',
        border: '1.5px solid var(--border-default)',
        padding: '12px 18px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        overflowX: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 800,
            fontFamily: 'var(--font-heading)',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: 'var(--ink-primary)'
          }}>
            TEST QUEUE
          </div>
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            background: 'var(--bg-surface-soft)',
            border: '1px solid var(--border-default)',
            color: 'var(--ink-primary)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            fontFamily: 'var(--font-mono)'
          }}>
            {metrics?.testsExecuted ?? 0} / {metrics?.testsTotal || testQueue.length || 5} Ran
          </span>
          <span style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: '#92400E',
            background: '#FEF3C7',
            border: '1px solid #F59E0B',
            padding: '2px 7px',
            borderRadius: '4px'
          }}>
            SIMULATION (mock data)
          </span>
        </div>

        <div style={{ height: '18px', width: '1px', background: 'var(--border-default)', flexShrink: 0 }} />

        {testQueue.length === 0 ? (
          <span style={{ fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>
            No test specifications generated yet.
          </span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {testQueue.map((test) => {
              const styles = getStatusStyles(test.status);
              return (
                <div
                  key={test.id}
                  onClick={() => onInspectTest(test.id)}
                  className="animate-fade-in"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-full)',
                    background: styles.bg,
                    color: styles.color,
                    border: styles.border,
                    fontSize: '11.5px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'transform 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <span style={{ fontSize: '12px' }}>{getStatusIcon(test.status)}</span>
                  <span>{test.id}</span>
                  <span style={{ opacity: 0.65, fontSize: '10.5px', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                    · {test.category}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
