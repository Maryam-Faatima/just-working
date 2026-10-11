import React, { useState } from 'react';
import { ENGINE_LOOP_STEPS } from '../types/mockData';

export function StagePanel({
  narration,
  conversationTurns,
  assertionResult,
  activeLoopStep,
  activityLogs
}) {
  const [logsExpanded, setLogsExpanded] = useState(false);

  const getRoleBadge = (role) => {
    switch (role) {
      case 'user':
        return { label: 'USER PROMPT', bg: 'var(--bg-inset)', color: 'var(--ink-secondary)' };
      case 'agent':
        return { label: 'TARGET AGENT', bg: 'var(--status-confirmed-bg)', color: 'var(--status-confirmed)' };
      case 'tool':
        return { label: 'TOOL INVOCATION', bg: 'var(--status-discovered-bg)', color: 'var(--status-discovered)' };
      case 'system':
        return { label: 'ASSERTION MONITOR', bg: 'var(--status-contradicted-bg)', color: 'var(--status-contradicted)' };
      default:
        return { label: role.toUpperCase(), bg: 'var(--bg-inset)', color: 'var(--ink-muted)' };
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
      {/* Panel Header */}
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
            background: 'var(--accent)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 800
          }}>
            ▶
          </div>
          <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink-primary)' }}>
            Execution Lab & Trace
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#92400E', background: '#FEF3C7', border: '1px solid #F59E0B', padding: '2px 7px', borderRadius: '4px' }}>
            SIMULATION (mock data)
          </span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)', background: 'var(--bg-inset)', padding: '2px 8px', borderRadius: '4px' }}>
            MULTI-TURN ADAPTER
          </span>
        </div>
      </div>

      {/* Narration Bar */}
      <div style={{
        background: 'linear-gradient(135deg, var(--accent) 0%, #C44C27 100%)',
        color: '#fff',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        fontSize: '13px',
        fontWeight: 600,
        lineHeight: 1.45,
        marginBottom: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 2px 8px rgba(224, 93, 56, 0.25)'
      }}>
        <span style={{ fontSize: '14px' }}>⚙</span>
        <span>{narration}</span>
      </div>

      {/* Conversation Stage */}
      <div style={{
        flex: 1,
        background: 'var(--bg-inset)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        minHeight: '230px'
      }}>
        {conversationTurns.length === 0 ? (
          <div style={{
            margin: 'auto',
            color: 'var(--ink-faint)',
            fontSize: '13px',
            fontStyle: 'italic',
            textAlign: 'center'
          }}>
            Dialogue stream will render here during execution.
          </div>
        ) : (
          conversationTurns.map((turn, i) => {
            const badge = getRoleBadge(turn.role);
            const isUser = turn.role === 'user';
            return (
              <div
                key={i}
                className="animate-fade-in"
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: isUser ? '85%' : '90%',
                  background: isUser ? '#fff' : turn.role === 'system' ? 'var(--status-contradicted-bg)' : '#fff',
                  border: isUser
                    ? '1.5px solid var(--border-default)'
                    : turn.role === 'system'
                    ? '1.5px solid var(--status-contradicted-border)'
                    : '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  letterSpacing: '0.4px',
                  color: badge.color,
                  marginBottom: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <span style={{
                    padding: '1px 5px',
                    borderRadius: '3px',
                    background: badge.bg
                  }}>
                    {badge.label}
                  </span>
                </div>
                <div style={{
                  fontSize: '13px',
                  lineHeight: 1.5,
                  color: turn.role === 'system' ? 'var(--status-contradicted)' : 'var(--ink-primary)',
                  fontWeight: turn.role === 'system' ? 700 : 400,
                  fontFamily: turn.role === 'tool' ? 'var(--font-mono)' : 'var(--font-sans)',
                  wordBreak: 'break-word'
                }}>
                  {turn.content}
                </div>
              </div>
            );
          })
        )}

        {/* Assertion Verdict Block */}
        {assertionResult && (
          <div className="animate-fade-in" style={{
            marginTop: '8px',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            borderLeft: `4px solid ${
              assertionResult.tone === 'rose'
                ? 'var(--status-contradicted)'
                : assertionResult.tone === 'gold'
                ? 'var(--status-discovered)'
                : 'var(--status-confirmed)'
            }`,
            background: assertionResult.tone === 'rose'
              ? 'var(--status-contradicted-bg)'
              : assertionResult.tone === 'gold'
              ? 'var(--status-discovered-bg)'
              : 'var(--status-confirmed-bg)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{
              fontSize: '11px',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: assertionResult.tone === 'rose'
                ? 'var(--status-contradicted)'
                : assertionResult.tone === 'gold'
                ? 'var(--status-discovered)'
                : 'var(--status-confirmed)',
              marginBottom: '6px'
            }}>
              VERDICT: {assertionResult.verdict}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink-secondary)', marginBottom: '3px' }}>
              <span style={{ fontWeight: 700 }}>Expected:</span> {assertionResult.expected}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink-secondary)' }}>
              <span style={{ fontWeight: 700 }}>Actual:</span> {assertionResult.actual}
            </div>
          </div>
        )}
      </div>

      {/* Loop Progression Strip */}
      <div style={{
        marginTop: '14px',
        padding: '6px 10px',
        borderRadius: 'var(--radius-full)',
        background: 'var(--bg-inset)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflowX: 'auto',
        gap: '4px'
      }}>
        {ENGINE_LOOP_STEPS.map((step, idx) => {
          const currentIdx = ENGINE_LOOP_STEPS.findIndex(s => s.key === activeLoopStep);
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;

          return (
            <React.Fragment key={step.key}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: '10.5px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                color: isActive ? '#fff' : isDone ? 'var(--ink-primary)' : 'var(--ink-faint)',
                background: isActive ? 'var(--accent)' : isDone ? 'var(--bg-sand)' : 'transparent',
                transition: 'all 0.2s ease'
              }}>
                <span style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: isActive ? '#fff' : isDone ? 'var(--ink-primary)' : 'var(--ink-faint)'
                }} className={isActive ? 'animate-pulse' : ''} />
                {step.label}
              </div>
              {idx < ENGINE_LOOP_STEPS.length - 1 && (
                <span style={{ color: 'var(--ink-faint)', fontSize: '11px' }}>→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Activity Logs Collapsible */}
      <div style={{ marginTop: '12px' }}>
        <button
          onClick={() => setLogsExpanded(!logsExpanded)}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--ink-muted)',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span>{logsExpanded ? '▼' : '▶'}</span>
          <span>Engine Event Stream ({activityLogs.length} events)</span>
        </button>

        {logsExpanded && (
          <div style={{
            marginTop: '8px',
            maxHeight: '110px',
            overflowY: 'auto',
            background: 'var(--bg-surface-soft)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            padding: '8px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px'
          }}>
            {activityLogs.map((log, index) => (
              <div key={index} style={{ marginBottom: '4px', display: 'flex', gap: '8px', color: 'var(--ink-secondary)' }}>
                <span style={{ color: 'var(--ink-faint)' }}>{log.timestamp}</span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
