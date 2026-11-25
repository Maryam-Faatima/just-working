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

  const VERDICT = {
    pass: { color: 'var(--gt-ok)', label: 'Pass' },
    weak: { color: 'var(--gt-warn)', label: 'Weak' },
    fail: { color: 'var(--gt-bad)', label: 'Fail' }
  };
  const vOf = (v) => VERDICT[v] || VERDICT.fail;
  const passedChecks = checksData.filter((c) => c.verdict === 'pass' || (c.passed && c.verdict !== 'weak')).length;
  const score = typeof overall?.score === 'number' ? overall.score : null;
  const ring = score === null ? 0 : Math.max(0, Math.min(1, score / 5));
  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <div className="cg animate-fade-in">
      <div className="cg-head">
        <div>
          <div className="gt-eyebrow"><i /> Live testing and evaluation</div>
          <h1>How your agent behaved</h1>
          <p>Pick a recorded conversation, read what happened, then let the judge score it against your rules.</p>
        </div>
        <button type="button" className="gt-btn-lime" onClick={() => handleRunEvaluation(true)} disabled={isEvaluating || !selectedTrace}>
          {isEvaluating ? 'Judging this conversation…' : 'Score this conversation ⚡'}
        </button>
      </div>

      {evalError && <div className="gt-fail-box"><b>Evaluation notice:</b> {evalError}</div>}

      <div className="tj-kpis">
        <div className="gt-glass tj-score">
          <svg viewBox="0 0 120 120" width="112" height="112" role="img" aria-label="Judge score">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(var(--gt-lc),0.16)" strokeWidth="10" />
            <circle cx="60" cy="60" r={R} fill="none" style={{ stroke: overall ? vOf(overall.verdict).color : 'rgba(var(--gt-lc),0.3)' }} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${C * ring} ${C}`} transform="rotate(-90 60 60)" />
            <text x="60" y="58" textAnchor="middle" className="tj-big">{score === null ? '—' : score}</text>
            <text x="60" y="76" textAnchor="middle" className="tj-small">out of 5</text>
          </svg>
          <div>
            <div className="tj-k">Judge verdict</div>
            <div className="tj-v" style={{ color: overall ? vOf(overall.verdict).color : undefined }}>{overall ? vOf(overall.verdict).label : 'Not scored yet'}</div>
            <div className="tj-sub">{overall ? 'Overall conversation quality' : 'Press “Score this conversation”'}</div>
          </div>
        </div>
        <div className="gt-glass tj-kpi"><div className="tj-k">Recorded conversations</div><div className="tj-n">{traces.length}</div></div>
        <div className="gt-glass tj-kpi"><div className="tj-k">Test scenarios</div><div className="tj-n">{testSpecs.length}</div></div>
        <div className="gt-glass tj-kpi">
          <div className="tj-k">Rules passed</div>
          <div className="tj-n">{checksData.length ? passedChecks : '—'}<span>{checksData.length ? ` / ${checksData.length}` : ''}</span></div>
          {checksData.length > 0 && <div className="ev-split" style={{ marginTop: '10px', height: '8px' }}><i style={{ width: `${(passedChecks / checksData.length) * 100}%`, background: 'var(--gt-ok)' }} /></div>}
        </div>
      </div>

      <div className="tj-layout">
        <aside className="tj-side">
          <div className="gt-glass tj-box">
            <div className="tj-bh">Conversations <b>{traces.length}</b></div>
            {isLoadingTraces && <div className="tj-empty">Loading…</div>}
            {!isLoadingTraces && traces.length === 0 && <div className="tj-empty">No recorded conversations yet.</div>}
            <div className="tj-list">
              {traces.map((tr) => (
                <button type="button" key={tr.filename} className={`tj-item${selectedTraceId === tr.filename ? ' on' : ''}`} onClick={() => handleSelectTrace(tr)}>
                  <div className="r1"><b>{tr.trace_id}</b><span className={`tj-st ${tr.run_status === 'completed' ? 'ok' : 'bad'}`}>{tr.run_status}</span></div>
                  <div className="r2"><span>{tr.test_id}</span><span>{tr.turns_count} turns</span></div>
                  {tr.is_fixture && <div className="r3">★ Recorded golden trace</div>}
                </button>
              ))}
            </div>
          </div>
          <div className="gt-glass tj-box">
            <div className="tj-bh">Test scenarios <b>{testSpecs.length}</b></div>
            <div className="tj-list">
              {testSpecs.map((spec) => (
                <button type="button" key={spec.test_id} className={`tj-item${selectedSpec?.test_id === spec.test_id ? ' on' : ''}`} onClick={() => { setSelectedSpec(spec); setActiveTab('spec'); }}>
                  <div className="r1"><b>{spec.test_id}</b><span className="tj-st">level {spec.difficulty || 1}</span></div>
                  <div className="r2"><span>{spec.persona || spec.category || 'Test scenario'}</span></div>
                  <div className="r3 dim">{spec.goal || spec.target_constraint || 'No goal written'}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="tj-main">
          <div className="gt-glass tj-box tj-chat">
            <div className="tj-chead">
              <div>
                <h2>The conversation</h2>
                <div className="tj-sub">
                  <code>{selectedTrace?.trace_id || 'none selected'}</code> · test <code>{selectedTrace?.test_id || '—'}</code> · {selectedTrace?.modality || 'text'}
                </div>
              </div>
              {selectedTrace && <span className={`tj-st big ${selectedTrace.run_status === 'completed' ? 'ok' : 'bad'}`}>{selectedTrace.run_status}</span>}
            </div>
            {selectedTrace && selectedTrace.run_status !== 'completed' && (
              <div className="gt-fail-box"><b>Run {selectedTrace.run_status}.</b> {selectedTrace.error || 'No error message was recorded.'}</div>
            )}
            {!selectedTrace && <div className="tj-empty">Choose a conversation on the left.</div>}
            {selectedTrace && selectedTrace.turns && (
              <div className="tj-turns">
                {selectedTrace.turns.map((turn, idx) => {
                  const isUser = turn.role === 'user';
                  const calls = turn.tool_calls || [];
                  return (
                    <div key={idx} className={`tj-turn ${isUser ? 'user' : 'agent'}`}>
                      <div className="bub">
                        <div className="who">{isUser ? 'Simulated user' : 'Your agent'} · turn {turn.turn}</div>
                        <div className="txt">{asText(turn.content)}</div>
                      </div>
                      {calls.map((call, cIdx) => (
                        <div key={cIdx} className="tj-tool">
                          <div className="nm">⚙ Called <code>{call.name}()</code></div>
                          {call.arguments && Object.keys(call.arguments).length > 0 && (
                            <details><summary>Arguments ({Object.keys(call.arguments).length})</summary><pre>{JSON.stringify(call.arguments, null, 2)}</pre></details>
                          )}
                          {call.result !== undefined && call.result !== null && (
                            <details><summary>What it returned</summary><pre>{typeof call.result === 'object' ? JSON.stringify(call.result, null, 2) : String(call.result)}</pre></details>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="gt-glass tj-box">
            <div className="cg-tabs" style={{ marginBottom: '16px' }}>
              <button type="button" className={activeTab === 'judge' ? 'on' : ''} onClick={() => setActiveTab('judge')}>Judge’s grades</button>
              <button type="button" className={activeTab === 'checks' ? 'on' : ''} onClick={() => setActiveTab('checks')}>Automatic checks {checksData.length}</button>
              {selectedSpec && <button type="button" className={activeTab === 'spec' ? 'on' : ''} onClick={() => setActiveTab('spec')}>Test scenario</button>}
            </div>

            {activeTab === 'judge' && (
              <>
                {!judgeData && (
                  <div className="tj-empty big"><b>This conversation has not been scored yet</b><span>Press “Score this conversation” to get a 1 to 5 grade and the reasoning for every rule.</span></div>
                )}
                {judgeData && (
                  <div className="tj-stack">
                    {overall && (
                      <div className="tj-overall" style={{ '--v': vOf(overall.verdict).color }}>
                        <div className="top"><b>Overall quality</b><span>{overall.score}/5 · {vOf(overall.verdict).label}</span></div>
                        <p>{overall.reasoning}</p>
                      </div>
                    )}
                    <div className="tj-bh">Grade for each rule <b>{ruleScores.length}</b></div>
                    {ruleScores.map((rs) => (
                      <div key={rs.rule_id} className="tj-rule" style={{ '--v': vOf(rs.verdict).color }}>
                        <div className="top">
                          <div className="l"><b>{rs.rule_id}</b><span className="tj-st">{rs.severity}</span></div>
                          <span className="pill">{rs.score}/5 · {vOf(rs.verdict).label}</span>
                        </div>
                        <div className="bar"><div style={{ width: `${(Math.max(0, Math.min(5, rs.score || 0)) / 5) * 100}%` }} /></div>
                        {ruleText(rs.rule_id) && <div className="rule">Rule: {ruleText(rs.rule_id)}</div>}
                        <p>{rs.reasoning}</p>
                        {rs.method && <div className="meth">graded by {rs.method}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'checks' && (
              <div className="tj-stack">
                {checksData.length === 0 && <div className="tj-empty big"><b>No automatic checks yet</b><span>They run together with the judge when you score a conversation.</span></div>}
                {checksData.map((chk, idx) => {
                  const k = chk.verdict === 'weak' ? 'weak' : chk.passed ? 'pass' : 'fail';
                  return (
                    <div key={idx} className="tj-rule" style={{ '--v': vOf(k).color }}>
                      <div className="top">
                        <div className="l"><b>{chk.rule_id}</b><span className="tj-st">{chk.severity}</span>{chk.method && <span className="meth inline">{chk.method}</span>}</div>
                        <span className="pill">{k === 'weak' ? 'Not decided' : k === 'pass' ? 'Passed' : 'Failed'}</span>
                      </div>
                      {ruleText(chk.rule_id) && <div className="rule">Rule: {ruleText(chk.rule_id)}</div>}
                      <p>{chk.reasoning || chk.description}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'spec' && selectedSpec && (
              <div className="tj-spec">
                <div><span>Test</span><code>{selectedSpec.test_id}</code></div>
                <div><span>Rule being tested</span>{selectedSpec.target_constraint || 'None'}</div>
                <div><span>Type</span><code>{selectedSpec.category}</code> · persona: {selectedSpec.persona}</div>
                <div><span>Goal</span>{selectedSpec.goal}</div>
                <div><span>Counts as success when</span>{selectedSpec.success_criteria}</div>
                {selectedSpec.script && selectedSpec.script.length > 0 && (
                  <div><span>Scripted messages ({selectedSpec.script.length})</span>
                    <ol>{selectedSpec.script.map((msg, i) => <li key={i}>{msg}</li>)}</ol>
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
