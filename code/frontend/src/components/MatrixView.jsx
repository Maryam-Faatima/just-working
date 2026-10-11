import React from 'react';
import { INITIAL_TEST_SPECS } from '../types/mockData';

export function MatrixView({ capabilities, testQueue, onInspectCap, onInspectTest }) {
  const capList = Object.values(capabilities);
  const inputCategories = ['Nominal / Functional', 'Invalid / Malformed', 'Boundary Condition', 'Adversarial Jailbreak'];

  return (
    <div className="animate-fade-in" style={{
      maxWidth: '1240px',
      margin: '12px auto 80px',
      padding: '0 24px'
    }}>
      {/* Title */}
      <div style={{ marginBottom: '28px' }}>
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
          <span>✦</span> Coverage Space Analysis
        </div>
        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '32px',
          fontWeight: 800,
          color: 'var(--ink-primary)',
          letterSpacing: '-0.8px'
        }}>
          Model Capabilities × Input Classes
        </h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Deterministic coverage matrix determining which input domains have been exercised against agent capabilities.
        </p>
      </div>

      {/* Coverage Matrix Table */}
      <div style={{
        background: '#fff',
        borderRadius: 'var(--radius-lg)',
        border: '1.5px solid var(--border-default)',
        padding: '24px',
        boxShadow: 'var(--shadow-card)',
        marginBottom: '32px',
        overflowX: 'auto'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid var(--border-default)' }}>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
                Target Capability
              </th>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
                Status
              </th>
              {inputCategories.map(cat => (
                <th key={cat} style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink-muted)', textAlign: 'center' }}>
                  {cat}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {capList.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                  Run the live test suite to populate the capability matrix.
                </td>
              </tr>
            ) : (
              capList.map(cap => (
                <tr
                  key={cap.id}
                  style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                  onClick={() => onInspectCap(cap)}
                >
                  <td style={{ padding: '14px', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--ink-primary)' }}>
                    {cap.name}
                    <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--ink-muted)', fontFamily: 'var(--font-sans)' }}>
                      {cap.id}
                    </div>
                  </td>
                  <td style={{ padding: '14px' }}>
                    <span style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: cap.status === 'confirmed' ? 'var(--status-confirmed-bg)' : cap.status === 'contradicted' ? 'var(--status-contradicted-bg)' : 'var(--bg-inset)',
                      color: cap.status === 'confirmed' ? 'var(--status-confirmed)' : cap.status === 'contradicted' ? 'var(--status-contradicted)' : 'var(--ink-secondary)'
                    }}>
                      {cap.status.toUpperCase()}
                    </span>
                  </td>

                  {/* Nominal cell */}
                  <td style={{ padding: '14px', textAlign: 'center' }}>
                    {cap.id === 'cap_001' || cap.id === 'cap_004' ? (
                      <span style={{ color: 'var(--status-confirmed)', fontWeight: 800 }}>✓ Covered</span>
                    ) : (
                      <span style={{ color: 'var(--ink-faint)' }}>—</span>
                    )}
                  </td>

                  {/* Malformed cell */}
                  <td style={{ padding: '14px', textAlign: 'center' }}>
                    {cap.id === 'cap_002' ? (
                      <span style={{ color: 'var(--status-confirmed)', fontWeight: 800 }}>✓ Covered</span>
                    ) : (
                      <span style={{ color: 'var(--ink-faint)' }}>—</span>
                    )}
                  </td>

                  {/* Boundary cell */}
                  <td style={{ padding: '14px', textAlign: 'center' }}>
                    {cap.id === 'cap_002' || cap.id === 'cap_004' ? (
                      <span style={{ color: 'var(--status-confirmed)', fontWeight: 800 }}>✓ Covered</span>
                    ) : (
                      <span style={{ color: 'var(--ink-faint)' }}>—</span>
                    )}
                  </td>

                  {/* Adversarial cell */}
                  <td style={{ padding: '14px', textAlign: 'center' }}>
                    {cap.id === 'cap_004' ? (
                      <span style={{ color: 'var(--status-contradicted)', fontWeight: 800, background: 'var(--status-contradicted-bg)', padding: '3px 8px', borderRadius: '4px' }}>
                        ✕ VIOLATION
                      </span>
                    ) : (
                      <span style={{ color: 'var(--ink-faint)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Generated Test Specs Detail */}
      <div style={{
        background: '#fff',
        borderRadius: 'var(--radius-lg)',
        border: '1.5px solid var(--border-default)',
        padding: '24px',
        boxShadow: 'var(--shadow-card)'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '16px' }}>
          Synthesized Test Specifications
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {Object.values(INITIAL_TEST_SPECS).map(spec => (
            <div
              key={spec.test_id}
              onClick={() => onInspectTest(spec.test_id)}
              style={{
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 18px',
                background: 'var(--bg-surface-soft)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 800, color: 'var(--accent)' }}>
                    {spec.test_id}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                    {spec.persona}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--ink-muted)', background: 'var(--bg-inset)', padding: '2px 7px', borderRadius: '4px' }}>
                    {spec.category}
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', marginTop: '4px' }}>
                  Goal: {spec.goal}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                  Diff: {spec.difficulty}/10
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>
                  Critic: {(spec.critic_score * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
