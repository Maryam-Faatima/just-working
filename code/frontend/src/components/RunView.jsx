import React, { useEffect, useRef, useState } from 'react';
import { fetchStageOutput } from '../services/api';
import { Phase0RubricView } from './Phase0RubricView';
import { ScanToolsView } from './ScanToolsView';
import { CallGraphView } from './CallGraphView';
import { BehavioralModelView } from './BehavioralModelView';
import { TestRunsJudgeView } from './TestRunsJudgeView';
import { EvidenceGraphView } from './EvidenceGraphView';
import { LiveModelChanges } from './LiveModelChanges';

const DEFAULT_ORDER = ['spec', 'scan', 'callgraph', 'model', 'infer', 'test', 'check', 'judge', 'report'];

const STAGE_META = {
  spec: { title: 'Requirements & rubric', short: 'Requirements', blurb: 'Turning your Phase 0 answers into a validated spec and a grading rubric.' },
  scan: { title: 'Code scan', short: 'Code scan', blurb: 'Reading your repository and listing tools, graph nodes and routes.' },
  callgraph: { title: 'Call graph', short: 'Call graph', blurb: 'Resolving which function calls which across your files.' },
  model: { title: 'Behavioral model', short: 'Model', blurb: 'Building the first model of what your agent can do and must never do.' },
  infer: { title: 'Model inference', short: 'Inference', blurb: 'Filling in capabilities and constraints the code does not show.' },
  test: { title: 'Test runs', short: 'Tests', blurb: 'Running generated conversations against your agent.' },
  check: { title: 'Model check', short: 'Check', blurb: 'Comparing test results with the model and updating how confident we are in each entry.' },
  judge: { title: 'Judge', short: 'Judge', blurb: 'Scoring every conversation against your rubric.' },
  report: { title: 'Evidence graph & report', short: 'Evidence', blurb: 'Linking every result back to the exact code that caused it.' }
};

const FINISHED = ['ok', 'warning', 'skipped', 'failed'];
const metaFor = (id) => STAGE_META[id] || { title: id, short: id, blurb: '' };
const kindOf = (status) => (status === 'ok' || status === 'warning' ? 'done' : status || 'pending');

function fmt(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function StageOutput({ stage, output, agent, rubric }) {
  switch (stage) {
    case 'spec':
      return <Phase0RubricView specData={output?.spec} rubricData={output?.rubric} />;
    case 'scan':
      return <ScanToolsView scanData={output} />;
    case 'callgraph':
      return <CallGraphView callgraphData={output} />;
    case 'model':
    case 'infer':
      return <BehavioralModelView modelData={output} currentAgent={agent} />;
    case 'test':
    case 'judge':
      return <TestRunsJudgeView currentAgent={agent} rubricData={rubric} />;
    case 'check':
      return <LiveModelChanges agentName={agent} active={false} />;
    case 'report':
      return <EvidenceGraphView evidenceData={output?.evidence} reportData={output?.report} currentAgent={agent} />;
    default:
      return null;
  }
}

export function RunView({ run, onOpenAnalysis, onBackToQuestionnaire }) {
  const stages = run.stages && run.stages.length
    ? run.stages
    : DEFAULT_ORDER.map((id) => ({ stage: id, status: 'pending', detail: '', seconds: null }));
  const hasRealStages = Boolean(run.stages && run.stages.length);

  const [viewed, setViewed] = useState(null);
  const [outputs, setOutputs] = useState({});
  const requested = useRef(new Set());
  const [now, setNow] = useState(Date.now());

  const running = run.status === 'running';
  const finishedCount = stages.filter((s) => FINISHED.includes(s.status)).length;
  const runDone = !running && run.status !== 'idle';
  const pct = Math.round((finishedCount / stages.length) * 100);

  // Elapsed timer, frozen when the run ends.
  const [endTime, setEndTime] = useState(null);
  useEffect(() => {
    if (!running) {
      setEndTime((t) => t ?? Date.now());
      return undefined;
    }
    setEndTime(null);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const elapsed = ((endTime || now) - run.startedAt) / 1000;

  // Start on the stage that is running now.
  useEffect(() => {
    if (viewed === null && hasRealStages) {
      const current = stages.find((s) => s.status === 'running') || stages.find((s) => !FINISHED.includes(s.status)) || stages[0];
      setViewed(current.stage);
    }
  }, [viewed, hasRealStages, stages]);

  // Load each stage's output the moment it finishes.
  useEffect(() => {
    stages.forEach((s) => {
      if ((s.status === 'ok' || s.status === 'warning') && !requested.current.has(s.stage)) {
        requested.current.add(s.stage);
        fetchStageOutput(run.agent, s.stage).then((out) => setOutputs((prev) => ({ ...prev, [s.stage]: out })));
      }
    });
  }, [stages, run.agent]);

  const viewedId = viewed ?? stages[0].stage;
  const idx = Math.max(0, stages.findIndex((s) => s.stage === viewedId));
  const cur = stages[idx];
  const meta = metaFor(cur.stage);
  const kind = kindOf(cur.status);
  const next = stages[idx + 1];
  const prev = stages[idx - 1];
  const canOpen = (s) => s && s.status !== 'pending';
  const outputLoaded = Object.prototype.hasOwnProperty.call(outputs, cur.stage);

  const goTo = (id) => setViewed(id);

  return (
    <div className="gt-run animate-fade-in">
      <div className="gt-run-top">
        <div>
          <h1>{running ? 'Analyzing ' : runDone && run.status === 'failed' ? 'Run stopped for ' : 'Finished '}<span>{run.agent}</span></h1>
          <p>{running ? 'Each stage opens here as soon as it finishes. Move on whenever you are ready.' : 'All stages have reported. Open any stage to review it.'}</p>
        </div>
        <div className="gt-run-meter">
          <div className="row"><span>{finishedCount} of {stages.length} stages</span><span>{fmt(elapsed)}</span></div>
          <div className="gt-bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      <div className="gt-rail">
        {stages.map((s, i) => {
          const k = kindOf(s.status);
          const sym = k === 'done' ? '✓' : k === 'failed' ? '✕' : k === 'skipped' ? '–' : i + 1;
          return (
            <button type="button" key={s.stage} disabled={!canOpen(s)} onClick={() => goTo(s.stage)}
              className={`gt-rchip ${k}${s.stage === cur.stage ? ' active' : ''}`}>
              <span className="gt-rdot">{sym}</span>{metaFor(s.stage).short}
            </button>
          );
        })}
      </div>

      <div className="gt-glass gt-stage-card" key={cur.stage}>
        <div className="gt-stage-head">
          <h2>{meta.title}</h2>
          <span className={`gt-status ${kind}`}>
            {kind === 'done' ? 'Done' : kind === 'running' ? 'Processing' : kind === 'skipped' ? 'Skipped' : kind === 'failed' ? 'Failed' : 'Waiting'}
            {cur.seconds != null && FINISHED.includes(cur.status) ? ` · ${cur.seconds}s` : ''}
          </span>
        </div>
        <p className="gt-stage-sub">{meta.blurb}</p>

        {!hasRealStages && (
          <div className="gt-proc">
            <div className="gt-orbit-wrap"><div className="gt-orbit"><i className="r1" /><i className="r2" /><i className="r3" /><img className="core" src="/logo.png" alt="" /></div></div>
            <div className="big">Starting the run…</div>
            <div className="line">{run.detail}</div>
          </div>
        )}

        {hasRealStages && kind === 'pending' && (
          <div className="gt-proc">
            <div className="big">Waiting for the earlier stages</div>
            <div className="line">This stage starts on its own once the one before it finishes.</div>
          </div>
        )}

        {hasRealStages && kind === 'running' && (
          <div className="gt-proc">
            <div className="gt-orbit-wrap"><div className="gt-orbit"><i className="r1" /><i className="r2" /><i className="r3" /><img className="core" src="/logo.png" alt="" /></div></div>
            <div className="big">Processing {meta.title.toLowerCase()}…</div>
            <div className="line">{run.detail}</div>
            {cur.stage === 'check' && <div style={{ width: '100%', textAlign: 'left' }}><LiveModelChanges agentName={run.agent} active /></div>}
          </div>
        )}

        {kind === 'skipped' && (
          <div className="gt-done-strip warn"><b>Skipped</b><code>{cur.detail}</code></div>
        )}

        {kind === 'failed' && (
          <div className="gt-fail-box"><b>This stage failed.</b><br />{cur.detail || run.error}</div>
        )}

        {kind === 'done' && (
          <>
            <div className={`gt-done-strip${cur.status === 'warning' ? ' warn' : ''}`}>
              <b>{cur.status === 'warning' ? 'Finished with a warning' : 'Finished'}</b>
              <code>{cur.detail}</code>
            </div>
            {!outputLoaded && <div className="gt-proc" style={{ padding: '24px 0' }}><div className="line">Loading results…</div></div>}
            {outputLoaded && outputs[cur.stage] == null && cur.stage !== 'check' && cur.stage !== 'test' && cur.stage !== 'judge' && (
              <div className="gt-empty">No output was written for this stage.</div>
            )}
            {outputLoaded && (outputs[cur.stage] != null || ['check', 'test', 'judge'].includes(cur.stage)) && (
              <div className={['callgraph', 'report', 'model', 'infer', 'test', 'judge', 'spec'].includes(cur.stage) ? 'gt-dark-screen' : 'legacy-canvas gt-out-sheet'}>
                <StageOutput stage={cur.stage} output={outputs[cur.stage]} agent={run.agent} rubric={outputs.spec?.rubric} />
              </div>
            )}
          </>
        )}

        {run.status === 'failed' && run.error && (
          <div className="gt-fail-box" style={{ marginTop: '16px' }}><b>The run stopped.</b><br />{run.error}</div>
        )}

        <div className="gt-nav">
          <button type="button" className="gt-btn-ghost" disabled={!prev} onClick={() => prev && goTo(prev.stage)}>← Previous stage</button>
          <div className="right">
            {run.status === 'failed' && onBackToQuestionnaire && (
              <button type="button" className="gt-btn-ghost" onClick={onBackToQuestionnaire}>Back to questionnaire</button>
            )}
            {next ? (
              <button type="button" className="gt-btn-lime sm" style={{ padding: '11px 26px', fontSize: '13.5px' }}
                disabled={!canOpen(next)} onClick={() => goTo(next.stage)}>
                {next.status === 'running'
                  ? `Next: ${metaFor(next.stage).title} (processing…) →`
                  : canOpen(next) ? `Next: ${metaFor(next.stage).title} →` : 'Next stage not started yet'}
              </button>
            ) : (
              <button type="button" className="gt-btn-lime sm" style={{ padding: '11px 26px', fontSize: '13.5px' }}
                disabled={running} onClick={onOpenAnalysis}>
                {running ? 'Finishing…' : 'Open full analysis →'}
              </button>
            )}
          </div>
        </div>
      </div>

      {runDone && run.status !== 'failed' && next && (
        <div style={{ textAlign: 'center', marginTop: '18px' }}>
          <button type="button" className="gt-link-btn" onClick={onOpenAnalysis}>Skip ahead: open the full analysis ↗</button>
        </div>
      )}
    </div>
  );
}
