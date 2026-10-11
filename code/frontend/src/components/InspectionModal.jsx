import React, { useState } from 'react';

export function InspectionModal({ item, onClose }) {
  const [showJson, setShowJson] = useState(false);
  if (!item) return null;

  const { type, data } = item;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(17, 24, 39, 0.45)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: '#fff',
        borderRadius: 'var(--radius-xl)',
        border: '1.5px solid var(--border-default)',
        maxWidth: '560px',
        width: '100%',
        maxHeight: '85vh',
        overflowY: 'auto',
        padding: '28px',
        position: 'relative',
        boxShadow: 'var(--shadow-float)'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: 'none',
            background: 'var(--bg-inset)',
            color: 'var(--ink-secondary)',
            fontSize: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700
          }}
        >
          ×
        </button>

        {/* Modal Header */}
        <div style={{
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          color: 'var(--accent)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px'
        }}>
          {type === 'cap' ? `Capability Inspection · ${data.id}` : type === 'test' ? `Test Specification · ${data.test_id}` : `Evidence Node · ${data.title}`}
        </div>

        <h2 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '22px',
          fontWeight: 700,
          color: 'var(--ink-primary)',
          marginBottom: '10px'
        }}>
          {data.name || data.title || data.persona}
        </h2>

        {data.description && (
          <p style={{ fontSize: '13.5px', color: 'var(--ink-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
            {data.description}
          </p>
        )}

        {/* Capability Specific Details */}
        {type === 'cap' && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              background: 'var(--bg-inset)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '14px'
            }}>
              <div>
                <div style={{ fontSize: '10.5px', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Confidence
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)' }}>
                  {((data.confidence || 0) * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10.5px', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Verification Status
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: data.status === 'contradicted' ? 'var(--status-contradicted)' : 'var(--status-confirmed)', textTransform: 'uppercase' }}>
                  {data.status}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Extracted Invariants
            </div>
            <ul style={{ paddingLeft: '18px', fontSize: '13px', color: 'var(--ink-secondary)', marginBottom: '14px' }}>
              {(data.constraints || []).map((c, i) => (
                <li key={i} style={{ marginBottom: '4px' }}>{c}</li>
              ))}
            </ul>

            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Grounding Evidence
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              background: 'var(--bg-inset)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--ink-primary)'
            }}>
              {(data.evidence || []).map((e, idx) => (
                <div key={idx}>
                  {e.source === 'static' ? `source: static · file: ${e.file} (lines ${e.lines})` : `source: runtime · test: ${e.test_id}`}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test Spec Specific Details */}
        {type === 'test' && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              background: 'var(--bg-inset)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '14px'
            }}>
              <div>
                <div style={{ fontSize: '10.5px', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Adversarial Difficulty
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 800, color: 'var(--accent)' }}>
                  {data.difficulty} / 10
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10.5px', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Target Capability
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                  {data.target_capability}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--ink-secondary)', marginBottom: '10px' }}>
              <b>Goal:</b> {data.goal}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ink-secondary)', marginBottom: '14px' }}>
              <b>Assertion Success Criteria:</b> {data.success_criteria}
            </div>
          </div>
        )}

        {/* JSON Inspector Accordion */}
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-default)', paddingTop: '14px' }}>
          <button
            onClick={() => setShowJson(!showJson)}
            style={{
              border: '1px solid var(--border-default)',
              background: 'var(--bg-inset)',
              color: 'var(--ink-secondary)',
              fontSize: '11.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              marginBottom: '8px'
            }}
          >
            {showJson ? '{ } Hide Schema Contract' : '{ } View Schema Contract JSON'}
          </button>

          {showJson && (
            <pre style={{
              background: '#1F2937',
              color: '#F9FAFB',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.5,
              overflowX: 'auto'
            }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
