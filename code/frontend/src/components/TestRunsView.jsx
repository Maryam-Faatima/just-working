import { useEffect, useState } from 'react';
import { fetchAgentTrace } from '../services/api';

/**
 * Phase 2: seed tests (EH-1) run by the test runner (EH-3) through the adapter (EH-4), with the
 * user simulator (EH-2) continuing each conversation. Shows real runs read from test_specs.json,
 * test_run.json and traces/. Pass and fail verdicts come later from the checks and the judge.
 */

const card = {
  background: '#fff',
  borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--border-default)',
  boxShadow: 'var(--shadow-sm)'
};

const STATUS_STYLE = {
  completed: { color: 'var(--status-confirmed)', bg: 'var(--status-confirmed-bg)', border: 'var(--status-confirmed-border)', label: 'Completed' },
  crashed: { color: 'var(--status-contradicted)', bg: 'var(--status-contradicted-bg)', border: 'var(--status-contradicted-border)', label: 'Crashed' },
  timeout: { color: 'var(--status-discovered)', bg: 'var(--status-discovered-bg)', border: 'var(--status-discovered-border)', label: 'Timed out' },
  not_run: { color: 'var(--status-unverified)', bg: 'var(--status-unverified-bg)', border: 'var(--status-unverified-border)', label: 'Not run' },
  invalid: { color: 'var(--status-contradicted)', bg: 'var(--status-contradicted-bg)', border: 'var(--status-contradicted-border)', label: 'Invalid spec' }
};

function Badge({ status, text }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.not_run;
  return (
    <span style={{
      fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--radius-full)',
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap'
    }}>
      {text || s.label}
    </span>
  );
}

function Chip({ children, mono }) {
  return (
    <span style={{
      fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-inset)', color: 'var(--ink-secondary)', border: '1px solid var(--border-subtle)',
      fontFamily: mono ? 'var(--font-mono)' : 'inherit', whiteSpace: 'nowrap'
    }}>
      {children}
    </span>
  );
}

function Metric({ label, value, note, color }) {
  return (
    <div style={{ ...card, padding: '16px 20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: color || 'var(--ink-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: color || 'var(--ink-primary)', marginTop: '4px' }}>{value}</div>
      <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>{note}</div>
    </div>
  );
}

function testOutcome(result) {
  if (!result) return { status: 'not_run', text: 'Not run yet' };
  if (result.status === 'invalid') return { status: 'invalid' };
  if (result.status !== 'ran') return { status: 'not_run' };
  if (result.crashed) return { status: 'crashed', text: `${result.crashed}/${result.runs} crashed` };
  if (result.timeout) return { status: 'timeout', text: `${result.timeout}/${result.runs} timed out` };
  return { status: 'completed', text: `${result.completed}/${result.runs} completed` };
}

function Conversation({ trace }) {
  if (!trace) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {trace.turns.map((turn) => {
        const isUser = turn.role === 'user';
        return (
          <div key={turn.turn} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-faint)', marginBottom: '4px' }}>
              {isUser ? 'Test user (persona)' : 'Agent under test'} · turn {turn.turn}
            </div>
            <div style={{
              maxWidth: '82%', padding: '10px 14px', fontSize: '13.5px', lineHeight: 1.5, whiteSpace: 'pre-wrap',
              borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: isUser ? 'var(--accent)' : 'var(--bg-surface-soft)',
              color: isUser ? '#fff' : 'var(--ink-primary)',
              border: isUser ? 'none' : '1px solid var(--border-subtle)'
            }}>
              {turn.content || <em style={{ opacity: 0.7 }}>(empty reply)</em>}
            </div>
            {!isUser && turn.tool_calls && turn.tool_calls.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', maxWidth: '82%' }}>
                {turn.tool_calls.map((call, i) => (
                  <span key={i} title={JSON.stringify(call.arguments || {})} style={{
                    fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--status-discovered-bg)', color: 'var(--status-discovered)', border: '1px solid var(--status-discovered-border)'
                  }}>
                    ⚙ {call.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {trace.run_status !== 'completed' && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '13px',
          background: STATUS_STYLE[trace.run_status]?.bg, color: STATUS_STYLE[trace.run_status]?.color,
          border: `1px solid ${STATUS_STYLE[trace.run_status]?.border}`
        }}>
          <strong>{STATUS_STYLE[trace.run_status]?.label}:</strong> {trace.error || 'no further messages were sent'}
        </div>
      )}
    </div>
  );
}

export function TestRunsView({ testsData, testRunData, currentAgent }) {
  const tests = Array.isArray(testsData) ? testsData : [];
  const results = Object.fromEntries((testRunData?.tests || []).map((r) => [r.test_id, r]));
  const [selectedId, setSelectedId] = useState(tests[0]?.test_id || null);
  const [runIndex, setRunIndex] = useState(0);
  // Conversations already loaded, keyed by "agent/file", so switching back to a run is instant.
  const [traceCache, setTraceCache] = useState({});

  const selected = tests.find((t) => t.test_id === selectedId) || tests[0];
  const selectedResult = selected ? results[selected.test_id] : null;
  const traceFiles = selectedResult?.traces || [];
  const traceFile = traceFiles[runIndex];
  const cacheKey = currentAgent && traceFile ? `${currentAgent}/${traceFile}` : null;
  const trace = cacheKey ? traceCache[cacheKey] : null;
  const loadingTrace = Boolean(cacheKey) && !(cacheKey in traceCache);

  useEffect(() => {
    if (!cacheKey || cacheKey in traceCache) return undefined;
    let cancelled = false;
    fetchAgentTrace(currentAgent, traceFile).then((data) => {
      if (!cancelled) setTraceCache((cache) => ({ ...cache, [cacheKey]: data }));
    });
    return () => { cancelled = true; };
  }, [cacheKey, traceCache, currentAgent, traceFile]);

  if (!tests.length) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ ...card, borderRadius: 'var(--radius-lg)', padding: '48px 24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink-primary)' }}>No Test Runs Yet</h3>
          <p style={{ color: 'var(--ink-muted)', marginTop: '8px' }}>
            Run the pipeline to generate seed tests from the rubric and model, then run them against the agent.
          </p>
        </div>
      </div>
    );
  }

  const totals = testRunData?.totals || { completed: 0, crashed: 0, timeout: 0 };
  const generated = tests.filter((t) => t.test_id?.startsWith('GT-')).length;
  const simulated = (testRunData?.tests || []).reduce((sum, r) => sum + (r.simulated_messages || 0), 0);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto 80px', padding: '0 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', fontSize: '11px',
          fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px'
        }}>
          <span>✦</span> Phase 2 · Dynamic Testing
        </div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '30px', fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.6px' }}>
          Seed Tests & Conversation Runs
        </h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '14.5px', marginTop: '4px' }}>
          Real conversations with the agent under test: each test is played by a persona, repeated to check reproducibility, and every turn is recorded with the tools the agent called.
        </p>
      </div>

      {testRunData?.simulator_note && (
        <div style={{
          ...card, padding: '12px 16px', marginBottom: '18px', fontSize: '13px',
          background: 'var(--status-unverified-bg)', borderColor: 'var(--status-unverified-border)', color: 'var(--ink-secondary)'
        }}>
          <strong>User simulator off.</strong> {testRunData.simulator_note.replace(/^user simulator off:\s*/, '')}. Tests ran on their scripts only.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        <Metric label="Tests" value={tests.length} note={generated ? `${generated} generated by the recipe` : 'seed tests'} color="var(--accent)" />
        <Metric label="Runs per test" value={testRunData?.repeats ?? '—'} note="repeats for reproducibility" />
        <Metric label="Completed" value={totals.completed} note="conversations finished" color="var(--status-confirmed)" />
        <Metric label="Crashed" value={totals.crashed} note="agent errors, recorded" color="var(--status-contradicted)" />
        <Metric label="Timed out" value={totals.timeout} note="never hangs a run" color="var(--status-discovered)" />
        <Metric label="Simulated messages" value={simulated} note="improvised by the persona" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: '18px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tests.map((t) => {
            const outcome = testOutcome(results[t.test_id]);
            const active = selected && t.test_id === selected.test_id;
            return (
              <button key={t.test_id} type="button" onClick={() => { setSelectedId(t.test_id); setRunIndex(0); }}
                style={{
                  ...card, textAlign: 'left', padding: '12px 14px', cursor: 'pointer', font: 'inherit',
                  borderColor: active ? 'var(--accent)' : 'var(--border-default)',
                  boxShadow: active ? 'var(--shadow-glow)' : 'var(--shadow-sm)'
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink-primary)' }}>{t.test_id}</span>
                  <Badge status={outcome.status} text={outcome.text} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0 6px' }}>
                  <Chip>{t.category}</Chip>
                  <Chip>difficulty {t.difficulty}</Chip>
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', lineHeight: 1.45 }}>{t.goal}</div>
              </button>
            );
          })}
        </div>

        {selected && (
          <div style={{ ...card, padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '19px', fontWeight: 800, color: 'var(--ink-primary)' }}>
                {selected.test_id}
              </h3>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <Chip mono>target {selected.target_id}</Chip>
                <Chip>{selected.turn_budget} turns max</Chip>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', rowGap: '8px', columnGap: '12px', fontSize: '13px', marginBottom: '16px' }}>
              <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Persona</span><span style={{ color: 'var(--ink-primary)' }}>{selected.persona}</span>
              <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Goal</span><span style={{ color: 'var(--ink-primary)' }}>{selected.goal}</span>
              <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Pass means</span><span style={{ color: 'var(--ink-primary)' }}>{selected.success_criteria}</span>
              {selected.target_constraint && (<>
                <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Probes</span><span style={{ color: 'var(--ink-primary)' }}>{selected.target_constraint}</span>
              </>)}
              {selected.script && selected.script.length > 0 && (<>
                <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Script</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink-secondary)' }}>{selected.script.join('  →  ')}</span>
              </>)}
            </div>

            {selectedResult && selectedResult.status !== 'ran' && (
              <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', fontSize: '13px', background: 'var(--status-unverified-bg)', border: '1px solid var(--status-unverified-border)', color: 'var(--ink-secondary)' }}>
                <strong>Not run:</strong> {selectedResult.reason}
              </div>
            )}

            {traceFiles.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
                  {traceFiles.map((file, i) => (
                    <button key={file} type="button" onClick={() => setRunIndex(i)} style={{
                      font: 'inherit', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', padding: '5px 12px',
                      borderRadius: 'var(--radius-full)', border: '1px solid var(--border-default)',
                      background: i === runIndex ? 'var(--accent)' : '#fff', color: i === runIndex ? '#fff' : 'var(--ink-secondary)'
                    }}>
                      Run {i + 1}
                    </button>
                  ))}
                  {selectedResult?.simulated_messages > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--ink-faint)', alignSelf: 'center' }}>
                      {selectedResult.simulated_messages} simulated message(s) across runs
                    </span>
                  )}
                </div>
                {loadingTrace ? (
                  <div style={{ color: 'var(--ink-muted)', fontSize: '13px' }}>Loading conversation…</div>
                ) : trace ? (
                  <Conversation trace={trace} />
                ) : (
                  <div style={{ color: 'var(--ink-muted)', fontSize: '13px' }}>Conversation file not found.</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
