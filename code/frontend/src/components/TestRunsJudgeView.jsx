import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAgentTestSpecs,
  fetchAgentTraces,
  fetchAgentTrace,
  fetchAgentJudgeResults,
  runJudgeEvaluation
} from '../services/api';

// Message content as plain text: strings, null, or LangChain-style content blocks.
const asText = (v) => {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((b) => (typeof b === 'string' ? b : (b && b.text) ?? JSON.stringify(b))).join('\n');
  return JSON.stringify(v);
};

export function TestRunsJudgeView({ currentAgent, rubricData }) {
  const [testSpecs, setTestSpecs] = useState([]);
  const [traces, setTraces] = useState([]);
  const [selectedTraceId, setSelectedTraceId] = useState(null);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [judgeData, setJudgeData] = useState(null);
  const [checksData, setChecksData] = useState([]);
  const [isLoadingTraces, setIsLoadingTraces] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError, setEvalError] = useState(null);
  const [selectedSpec, setSelectedSpec] = useState(null);
  const [activeTab, setActiveTab] = useState('judge'); // 'judge' | 'checks' | 'spec'
  const loadToken = useRef(0); // ignores answers that arrive after the agent was changed

  const ruleText = (id) => rubricData?.items?.find((i) => i.rule_id === id)?.description;

  // Load test specs & traces list for current agent
  const loadInitialData = useCallback(async () => {
    const token = ++loadToken.current;
    // Nothing from the previous agent may stay on screen or be sent to this agent's rubric.
    setTestSpecs([]);
    setSelectedSpec(null);
    setTraces([]);
    setSelectedTraceId(null);
    setSelectedTrace(null);
    setJudgeData(null);
    setChecksData([]);
    if (!currentAgent) return;
    setIsLoadingTraces(true);
    setEvalError(null);
    try {
      const [specs, traceList, savedEval] = await Promise.all([
        fetchAgentTestSpecs(currentAgent),
        fetchAgentTraces(currentAgent),
        fetchAgentJudgeResults(currentAgent).catch(() => null)
      ]);
      if (token !== loadToken.current) return;

      setTestSpecs(specs || []);
      if (specs && specs.length > 0) {
        setSelectedSpec(specs[0]);
      }

      setTraces(traceList || []);
      let firstContent = null;
      if (traceList && traceList.length > 0) {
        const firstTrace = traceList[0];
        firstContent = await fetchAgentTrace(currentAgent, firstTrace.filename);
        if (token !== loadToken.current) return;
        setSelectedTraceId(firstTrace.filename);
        setSelectedTrace(firstContent);
      }

      // Saved results are shown only if they belong to the trace on screen.
      if (savedEval && savedEval.judge && firstContent && savedEval.judge.trace_id === firstContent.trace_id) {
        setJudgeData(savedEval.judge);
        setChecksData(savedEval.checks || []);
      }
    } catch (err) {
      if (token === loadToken.current) setEvalError('Could not load test runs for this agent.');
      console.error('Failed to load test runs data:', err);
    } finally {
      if (token === loadToken.current) setIsLoadingTraces(false);
    }
  }, [currentAgent]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Handle trace selection
  const handleSelectTrace = async (traceItem) => {
    const token = ++loadToken.current;
    setSelectedTraceId(traceItem.filename);
    try {
      const content = await fetchAgentTrace(currentAgent, traceItem.filename);
      if (token !== loadToken.current) return;
      setSelectedTrace(content);
      // Judge and check results belong to one trace; drop them when another trace is opened.
      if (judgeData && judgeData.trace_id !== content?.trace_id) {
        setJudgeData(null);
        setChecksData([]);
      }
    } catch (err) {
      console.error('Failed to fetch trace content:', err);
    }
  };

  // Run LLM Judge evaluation on currently selected trace
  const handleRunEvaluation = async (useLlm = true) => {
    if (!currentAgent) return;
    setIsEvaluating(true);
    setEvalError(null);
    try {
      const result = await runJudgeEvaluation(currentAgent, {
        trace: selectedTrace,
        traceFile: selectedTraceId,
        useLlm: useLlm
      });
      if (result.judge) {
        setJudgeData(result.judge);
      }
      if (result.checks) {
        setChecksData(result.checks);
      }
    } catch (err) {
      setEvalError(err.message || 'Evaluation failed.');
    } finally {
      setIsEvaluating(false);
    }
  };

  const overall = judgeData?.overall_quality;
  const ruleScores = judgeData?.rule_scores || [];

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1360px', margin: '16px auto 80px', padding: '0 24px' }}>
      {/* Header Bar */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
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
            <span>✦</span> Stage 5 · Live Testing & Semantic Evaluation
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '30px', fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.6px' }}>
            Test Runs & LLM Judge
          </h1>
          <p style={{ color: 'var(--ink-secondary)', fontSize: '14.5px', marginTop: '4px' }}>
            Multi-turn conversation trace inspection, deterministic checks, and semantic LLM Judge reasoning.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => handleRunEvaluation(true)}
            disabled={isEvaluating || !selectedTrace}
            style={{
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
              padding: '10px 20px',
              borderRadius: 'var(--radius-full)',
              cursor: isEvaluating ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 10px rgba(224, 93, 56, 0.28)',
              opacity: isEvaluating ? 0.7 : 1
            }}
          >
            {isEvaluating ? (
              <>
                <span className="animate-spin">⟳</span>
                Evaluating with Judge...
              </>
            ) : (
              <>
                <span>⚡</span>
                Evaluate Trace with LLM Judge
              </>
            )}
          </button>
        </div>
      </div>

      {evalError && (
        <div style={{
          background: '#FEE2E2',
          border: '1.5px solid #F87171',
          color: '#991B1B',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          fontSize: '13px'
        }}>
          <strong>Evaluation notice:</strong> {evalError}
        </div>
      )}

      {/* Top Overview KPI Bento */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        {/* Overall Judge Score Card */}
        <div style={{
          background: '#fff',
          padding: '18px 20px',
          borderRadius: 'var(--radius-lg)',
          border: '1.5px solid var(--border-default)',
          boxShadow: 'var(--shadow-sm)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
              LLM Judge Overall Score
            </span>
            {overall && (
              <span style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                textTransform: 'uppercase',
                background: overall.verdict === 'pass' ? '#DCFCE7' : overall.verdict === 'weak' ? '#FEF3C7' : '#FEE2E2',
                color: overall.verdict === 'pass' ? '#16A34A' : overall.verdict === 'weak' ? '#92400E' : '#DC2626'
              }}>
                {overall.verdict}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '36px', fontWeight: 900, color: 'var(--ink-primary)' }}>
              {overall ? `${overall.score}` : '—'}
            </span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink-muted)' }}>/ 5</span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-secondary)', marginTop: '4px' }}>
            {overall ? 'Holistic conversational quality' : 'Awaiting evaluation'}
          </div>
        </div>

        {/* Traces Count */}
        <div style={{
          background: '#fff',
          padding: '18px 20px',
          borderRadius: 'var(--radius-lg)',
          border: '1.5px solid var(--border-default)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
            Available Traces
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '36px', fontWeight: 900, color: 'var(--ink-primary)', marginTop: '6px' }}>
            {traces.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-secondary)', marginTop: '4px' }}>
            Recorded agent runs
          </div>
        </div>

        {/* Generated Specs */}
        <div style={{
          background: '#fff',
          padding: '18px 20px',
          borderRadius: 'var(--radius-lg)',
          border: '1.5px solid var(--border-default)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
            Generated Test Specs
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '36px', fontWeight: 900, color: 'var(--ink-primary)', marginTop: '6px' }}>
            {testSpecs.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-secondary)', marginTop: '4px' }}>
            Seed & invariant specs
          </div>
        </div>

        {/* Deterministic Rules Checked */}
        <div style={{
          background: '#fff',
          padding: '18px 20px',
          borderRadius: 'var(--radius-lg)',
          border: '1.5px solid var(--border-default)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
            Checks Engine
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '36px', fontWeight: 900, color: 'var(--ink-primary)', marginTop: '6px' }}>
            {checksData.length > 0 ? checksData.filter(c => c.verdict === 'pass').length : '—'}
            <span style={{ fontSize: '18px', color: 'var(--ink-muted)', fontWeight: 600 }}>
              {checksData.length > 0 ? ` / ${checksData.length}` : ''}
            </span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-secondary)', marginTop: '4px' }}>
            Rules passed (weak = not decided)
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: Traces & Specs (Left) vs Trace Content & Evaluation (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Left Column: Traces and Specs List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Traces List Card */}
          <div style={{
            background: '#fff',
            borderRadius: 'var(--radius-lg)',
            border: '1.5px solid var(--border-default)',
            padding: '18px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink-primary)', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Recorded Traces</span>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', background: 'var(--bg-inset)', padding: '2px 6px', borderRadius: '4px', color: 'var(--ink-muted)' }}>
                {traces.length}
              </span>
            </div>

            {isLoadingTraces && (
              <div style={{ fontSize: '12.5px', color: 'var(--ink-muted)', padding: '16px 0', textAlign: 'center' }}>
                Loading traces...
              </div>
            )}

            {!isLoadingTraces && traces.length === 0 && (
              <div style={{ fontSize: '12.5px', color: 'var(--ink-muted)', padding: '16px 0', textAlign: 'center' }}>
                No traces found for this agent yet.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
              {traces.map((tr) => {
                const isSelected = selectedTraceId === tr.filename;
                return (
                  <div
                    key={tr.filename}
                    onClick={() => handleSelectTrace(tr)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                      background: isSelected ? '#FFF7ED' : 'var(--bg-inset)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 800, color: 'var(--ink-primary)' }}>
                        {tr.trace_id}
                      </span>
                      <span style={{
                        fontSize: '9.5px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: tr.run_status === 'completed' ? '#DCFCE7' : '#FEE2E2',
                        color: tr.run_status === 'completed' ? '#16A34A' : '#DC2626'
                      }}>
                        {tr.run_status}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Test: {tr.test_id}</span>
                      <span>{tr.turns_count} turns</span>
                    </div>
                    {tr.is_fixture && (
                      <div style={{ marginTop: '4px', fontSize: '10px', color: '#B45309', fontWeight: 700 }}>
                        ★ Recorded Golden Trace
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Test Specs List Card */}
          <div style={{
            background: '#fff',
            borderRadius: 'var(--radius-lg)',
            border: '1.5px solid var(--border-default)',
            padding: '18px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink-primary)', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Test Specs</span>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', background: 'var(--bg-inset)', padding: '2px 6px', borderRadius: '4px', color: 'var(--ink-muted)' }}>
                {testSpecs.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {testSpecs.map((spec) => {
                const isSelected = selectedSpec?.test_id === spec.test_id;
                return (
                  <div
                    key={spec.test_id}
                    onClick={() => setSelectedSpec(spec)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                      background: isSelected ? '#FFF7ED' : '#FAFAF9',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 800 }}>
                        {spec.test_id}
                      </span>
                      <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: '3px', background: 'var(--bg-inset)', color: 'var(--ink-muted)' }}>
                        Diff: {spec.difficulty || 1}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-secondary)', marginTop: '4px', fontWeight: 600 }}>
                      {spec.persona || spec.category || 'Test Scenario'}
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--ink-faint)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {spec.goal || spec.target_constraint || 'No goal description'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Trace Turns Viewer & Judge Evaluation Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Trace Content Panel */}
          <div style={{
            background: '#fff',
            borderRadius: 'var(--radius-lg)',
            border: '1.5px solid var(--border-default)',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)' }}>
                  Multi-Turn Trace Execution
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '2px' }}>
                  Trace ID: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-primary)' }}>{selectedTrace?.trace_id || 'None'}</code> ·
                  Test ID: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-primary)' }}>{selectedTrace?.test_id || 'None'}</code> ·
                  Modality: {selectedTrace?.modality || 'text'}
                </div>
              </div>

              {selectedTrace && (
                <span style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  background: selectedTrace.run_status === 'completed' ? '#DCFCE7' : '#FEE2E2',
                  color: selectedTrace.run_status === 'completed' ? '#16A34A' : '#DC2626',
                  textTransform: 'uppercase'
                }}>
                  {selectedTrace.run_status}
                </span>
              )}
            </div>

            {selectedTrace && selectedTrace.run_status !== 'completed' && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: '12.5px', marginBottom: '12px' }}>
                <strong>Run {selectedTrace.run_status}.</strong> {selectedTrace.error || 'No error message was recorded.'}
              </div>
            )}

            {/* Conversation Turns List */}
            {selectedTrace && selectedTrace.turns && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '420px', overflowY: 'auto', paddingRight: '6px' }}>
                {selectedTrace.turns.map((turn, idx) => {
                  const isUser = turn.role === 'user';
                  const hasTools = turn.tool_calls && turn.tool_calls.length > 0;

                  return (
                    <div key={idx} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start'
                    }}>
                      <div style={{
                        maxWidth: '82%',
                        borderRadius: 'var(--radius-md)',
                        padding: '12px 16px',
                        fontSize: '13px',
                        lineHeight: 1.5,
                        background: isUser ? 'var(--accent)' : 'var(--bg-inset)',
                        color: isUser ? '#fff' : 'var(--ink-primary)',
                        border: isUser ? 'none' : '1px solid var(--border-default)',
                        boxShadow: 'var(--shadow-sm)'
                      }}>
                        <div style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                          marginBottom: '4px',
                          color: isUser ? 'rgba(255,255,255,0.85)' : 'var(--ink-muted)'
                        }}>
                          Turn {turn.turn} · {isUser ? 'User Persona' : 'Agent'}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>
                          {asText(turn.content)}
                        </div>
                      </div>

                      {/* Tool Calls inside Agent Turn */}
                      {hasTools && (
                        <div style={{ marginTop: '8px', maxWidth: '82%', width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {turn.tool_calls.map((call, cIdx) => (
                            <div key={cIdx} style={{
                              background: '#FFFBEB',
                              border: '1px solid #FDE68A',
                              borderRadius: 'var(--radius-sm)',
                              padding: '8px 12px',
                              fontSize: '11px',
                              fontFamily: 'var(--font-mono)',
                              wordBreak: 'break-word',
                              overflowWrap: 'anywhere'
                            }}>
                              <div style={{ fontWeight: 800, color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>⚙</span> Tool Invocation: <code>{call.name}()</code>
                              </div>
                              {call.arguments && Object.keys(call.arguments).length > 0 && (
                                <details style={{ marginTop: '4px', cursor: 'pointer' }}>
                                  <summary style={{ color: '#78350F', fontSize: '10.5px', fontWeight: 600 }}>
                                    Arguments ({Object.keys(call.arguments).length})
                                  </summary>
                                  <pre style={{
                                    marginTop: '4px',
                                    padding: '6px 8px',
                                    background: 'rgba(254, 243, 199, 0.5)',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    color: '#78350F'
                                  }}>
                                    {JSON.stringify(call.arguments, null, 2)}
                                  </pre>
                                </details>
                              )}
                              {call.result !== undefined && call.result !== null && (
                                <details style={{ marginTop: '3px', cursor: 'pointer' }}>
                                  <summary style={{ color: '#92400E', fontSize: '10px', fontWeight: 600 }}>
                                    Return Data Preview
                                  </summary>
                                  <pre style={{
                                    marginTop: '4px',
                                    padding: '6px 8px',
                                    background: 'rgba(254, 243, 199, 0.5)',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    maxHeight: '160px',
                                    overflowY: 'auto',
                                    color: '#451A03'
                                  }}>
                                    {typeof call.result === 'object' ? JSON.stringify(call.result, null, 2) : String(call.result)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Evaluation Tabs Panel (LLM Judge vs Deterministic Checks) */}
          <div style={{
            background: '#fff',
            borderRadius: 'var(--radius-lg)',
            border: '1.5px solid var(--border-default)',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setActiveTab('judge')}
                  style={{
                    border: 'none',
                    background: activeTab === 'judge' ? 'var(--accent)' : 'var(--bg-inset)',
                    color: activeTab === 'judge' ? '#fff' : 'var(--ink-secondary)',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-full)',
                    cursor: 'pointer'
                  }}
                >
                  ⚖ LLM Judge Evaluation
                </button>
                <button
                  onClick={() => setActiveTab('checks')}
                  style={{
                    border: 'none',
                    background: activeTab === 'checks' ? 'var(--accent)' : 'var(--bg-inset)',
                    color: activeTab === 'checks' ? '#fff' : 'var(--ink-secondary)',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-full)',
                    cursor: 'pointer'
                  }}
                >
                  ✓ Deterministic Checks ({checksData.length})
                </button>
                {selectedSpec && (
                  <button
                    onClick={() => setActiveTab('spec')}
                    style={{
                      border: 'none',
                      background: activeTab === 'spec' ? 'var(--accent)' : 'var(--bg-inset)',
                      color: activeTab === 'spec' ? '#fff' : 'var(--ink-secondary)',
                      fontWeight: 700,
                      fontSize: '12px',
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-full)',
                      cursor: 'pointer'
                    }}
                  >
                    📋 Test Spec Info
                  </button>
                )}
              </div>
            </div>

            {/* TAB 1: LLM JUDGE */}
            {activeTab === 'judge' && (
              <div>
                {!judgeData && (
                  <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--ink-muted)' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚖</div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink-primary)' }}>
                      No Judge Evaluation for this Trace Yet
                    </div>
                    <p style={{ fontSize: '12.5px', marginTop: '4px', maxWidth: '420px', margin: '6px auto 16px' }}>
                      Click the "Evaluate Trace with LLM Judge" button above to run real-time semantic 1–5 scoring with reasoning.
                    </p>
                  </div>
                )}

                {judgeData && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Overall Reasoning Block */}
                    {overall && (
                      <div style={{
                        background: overall.verdict === 'pass' ? '#F0FDF4' : overall.verdict === 'weak' ? '#FFFBEB' : '#FEF2F2',
                        border: `1.5px solid ${overall.verdict === 'pass' ? '#86EFAC' : overall.verdict === 'weak' ? '#FDE68A' : '#FCA5A5'}`,
                        borderRadius: 'var(--radius-md)',
                        padding: '16px',
                        fontSize: '13px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 800, color: 'var(--ink-primary)' }}>
                            Overall Conversational Quality Assessment
                          </span>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            fontSize: '12px',
                            color: overall.verdict === 'pass' ? '#16A34A' : overall.verdict === 'weak' ? '#92400E' : '#DC2626'
                          }}>
                            Score: {overall.score}/5 ({String(overall.verdict).toUpperCase()})
                          </span>
                        </div>
                        <div style={{ color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                          {overall.reasoning}
                        </div>
                      </div>
                    )}

                    {/* Per-Rule Scores Cards */}
                    <div>
                      <h3 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '10px' }}>
                        Rule-by-Rule Semantic Grades ({ruleScores.length})
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {ruleScores.map((rs) => {
                          const isPass = rs.verdict === 'pass';
                          const isWeak = rs.verdict === 'weak';
                          return (
                            <div key={rs.rule_id} style={{
                              background: '#FAFAF9',
                              border: '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-md)',
                              padding: '12px 14px'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '12.5px', color: 'var(--ink-primary)' }}>
                                    {rs.rule_id}
                                  </span>
                                  <span style={{ fontSize: '10px', textTransform: 'uppercase', padding: '1px 5px', borderRadius: '3px', background: 'var(--bg-inset)', color: 'var(--ink-muted)' }}>
                                    {rs.severity}
                                  </span>
                                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>
                                    Method: {rs.method}
                                  </span>
                                </div>
                                <span style={{
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: 'var(--radius-full)',
                                  background: isPass ? '#DCFCE7' : isWeak ? '#FEF3C7' : '#FEE2E2',
                                  color: isPass ? '#16A34A' : isWeak ? '#92400E' : '#DC2626'
                                }}>
                                  Score {rs.score}/5 · {String(rs.verdict).toUpperCase()}
                                </span>
                              </div>
                              {ruleText(rs.rule_id) && (
                                <div style={{ fontSize: '11.5px', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
                                  Rule: {ruleText(rs.rule_id)}
                                </div>
                              )}
                              <div style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', marginTop: '4px', lineHeight: 1.45 }}>
                                {rs.reasoning}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: DETERMINISTIC CHECKS */}
            {activeTab === 'checks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {checksData.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--ink-muted)', fontSize: '13px' }}>
                    No deterministic check results loaded yet. Run evaluation to compute static checks.
                  </div>
                )}
                {checksData.map((chk, idx) => (
                  <div key={idx} style={{
                    background: '#FAFAF9',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '12.5px', color: 'var(--ink-primary)' }}>
                          {chk.rule_id}
                        </span>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', padding: '1px 5px', borderRadius: '3px', background: 'var(--bg-inset)', color: 'var(--ink-muted)' }}>
                          {chk.severity}
                        </span>
                        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>
                          {chk.method}
                        </span>
                      </div>
                      {ruleText(chk.rule_id) && (
                        <div style={{ fontSize: '11.5px', color: 'var(--ink-muted)', fontStyle: 'italic', marginTop: '4px' }}>
                          Rule: {ruleText(chk.rule_id)}
                        </div>
                      )}
                      <div style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', marginTop: '4px' }}>
                        {chk.reasoning || chk.description}
                      </div>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: chk.verdict === 'weak' ? '#FEF3C7' : chk.passed ? '#DCFCE7' : '#FEE2E2',
                      color: chk.verdict === 'weak' ? '#92400E' : chk.passed ? '#16A34A' : '#DC2626',
                      flexShrink: 0
                    }}>
                      {chk.verdict === 'weak' ? 'NOT DECIDED' : chk.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 3: SPEC INFO */}
            {activeTab === 'spec' && selectedSpec && (
              <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Test ID:</strong> <code>{selectedSpec.test_id}</code>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Target Constraint:</strong> {selectedSpec.target_constraint || 'None'}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Category:</strong> <code>{selectedSpec.category}</code> · <strong>Persona:</strong> {selectedSpec.persona}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Goal:</strong> {selectedSpec.goal}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Success Criteria:</strong> {selectedSpec.success_criteria}
                </div>
                {selectedSpec.script && selectedSpec.script.length > 0 && (
                  <div>
                    <strong>Scripted Messages ({selectedSpec.script.length}):</strong>
                    <ul style={{ paddingLeft: '20px', marginTop: '4px' }}>
                      {selectedSpec.script.map((msg, mIdx) => (
                        <li key={mIdx}><code>"{msg}"</code></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
