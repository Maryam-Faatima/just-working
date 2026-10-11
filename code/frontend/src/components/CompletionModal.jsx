import React from 'react';

export function CompletionModal({ metrics, onClose, onViewReport, onDownloadReport }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(17, 24, 39, 0.5)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 110,
      padding: '20px'
    }}>
      <div className="animate-fade-in" style={{
        background: '#fff',
        borderRadius: 'var(--radius-xl)',
        border: '1.5px solid var(--border-default)',
        maxWidth: '520px',
        width: '100%',
        padding: '32px',
        textAlign: 'center',
        boxShadow: 'var(--shadow-float)',
        position: 'relative'
      }}>
        {/* Success Icon */}
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: 'var(--status-confirmed-bg)',
          color: 'var(--status-confirmed)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '26px',
          fontWeight: 800,
          margin: '0 auto 16px'
        }}>
          ✓
        </div>

        <div style={{
          fontSize: '11px',
          fontWeight: 800,
          color: 'var(--accent)',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          marginBottom: '6px'
        }}>
          Verification Suite Converged
        </div>

        <h2 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '26px',
          fontWeight: 800,
          color: 'var(--ink-primary)',
          marginBottom: '10px'
        }}>
          Dynamic Run Complete
        </h2>

        <p style={{
          fontSize: '14px',
          color: 'var(--ink-secondary)',
          lineHeight: 1.5,
          marginBottom: '24px'
        }}>
          GreatTest successfully concluded multi-turn adversarial testing across the state space. <b>1 critical invariant violation</b> was isolated where the agent cancelled reservations without confirmation.
        </p>

        {/* Highlights summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          background: 'var(--bg-inset)',
          padding: '14px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '24px'
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 800, color: 'var(--ink-primary)' }}>
              {metrics.testsExecuted || 4}/{metrics.testsTotal || 4}
            </div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
              Tests Ran
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 800, color: 'var(--status-contradicted)' }}>
              {metrics.contradictions || 1}
            </div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
              Invariant Fail
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 800, color: 'var(--accent)' }}>
              {metrics.coveragePct || 94}%
            </div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
              Coverage
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={onClose}
            style={{
              border: '1px solid var(--border-default)',
              background: '#fff',
              color: 'var(--ink-secondary)',
              fontWeight: 600,
              fontSize: '13px',
              padding: '10px 18px',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer'
            }}
          >
            Close & Inspect
          </button>
          <button
            onClick={() => {
              onClose();
              onViewReport();
            }}
            style={{
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
              padding: '10px 22px',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-glow)'
            }}
          >
            View Full Audit & Findings →
          </button>
        </div>
      </div>
    </div>
  );
}
