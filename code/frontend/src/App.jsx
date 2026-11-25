import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Logo } from './components/Logo';
import { Header } from './components/Header';
import { HeroScene } from './components/HeroScene';
import { PipelineSummaryView } from './components/PipelineSummaryView';
import { Phase0RubricView } from './components/Phase0RubricView';
import { ScanToolsView } from './components/ScanToolsView';
import { CallGraphView } from './components/CallGraphView';
import { BehavioralModelView } from './components/BehavioralModelView';
import { RunView } from './components/RunView';
import { TestRunsJudgeView } from './components/TestRunsJudgeView';
import { EvidenceGraphView } from './components/EvidenceGraphView';
import { ReproducibilityPanel } from './components/TestRunsView';
import { RequirementsQuestionnaireView } from './components/RequirementsQuestionnaireView';
import {
  checkBackendHealth,
  fetchAgentSummary,
  fetchAgentSpec,
  fetchAgentRubric,
  fetchAgentScan,
  fetchAgentCallgraph,
  fetchAgentModel,
  fetchAgentEvidence,
  fetchAgentReport,
  fetchAgentTests,
  fetchAgentTestRun,
  fetchAgentRepro,
  triggerPipelineRun,
  fetchAgentStatus
} from './services/api';
import './App.css';

const SCREENS = [
  { id: 'summary', label: 'Pipeline Summary' },
  { id: 'spec', label: 'Specs & Rubric' },
  { id: 'scan', label: 'AST Scan & Tools' },
  { id: 'callgraph', label: 'Call Graph' },
  { id: 'model', label: 'Behavioral Model V0' },
  { id: 'test', label: 'Test Runs & LLM Judge' },
  { id: 'evidence', label: 'Evidence Graph' }
];

function App() {
  const [currentView, setCurrentView] = useState('landing'); // 'landing' | 'questionnaire' | 'analysis'
  const [activeScreenIndex, setActiveScreenIndex] = useState(0);
  const [currentAgent, setCurrentAgent] = useState('');
  const [hasLoadedAgent, setHasLoadedAgent] = useState(false);

  // Loaded outputs for the analyzed agent
  const [summaryData, setSummaryData] = useState(null);
  const [specData, setSpecData] = useState(null);
  const [rubricData, setRubricData] = useState(null);
  const [scanData, setScanData] = useState(null);
  const [callgraphData, setCallgraphData] = useState(null);
  const [modelData, setModelData] = useState(null);
  const [evidenceData, setEvidenceData] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [testsData, setTestsData] = useState(null);
  const [testRunData, setTestRunData] = useState(null);
  const [reproData, setReproData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  // Live run: { agent, source, startedAt, status, detail, stages, error }
  const [run, setRun] = useState(null);
  const pollRef = useRef(null);
  useEffect(() => () => clearInterval(pollRef.current), []);

  // Disable browser automatic scroll restoration so page always reloads at top
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  // Always reset scroll position to top whenever navigating between screens
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [activeScreenIndex]);

  // Load Agent Outputs
  const loadAgentData = useCallback(async (agentName) => {
    if (!agentName) return;
    setIsLoading(true);
    try {
      const [sum, sp, rub, scn, cg, mdl, evd, rpt, tst, trun, rep] = await Promise.all([
        fetchAgentSummary(agentName),
        fetchAgentSpec(agentName),
        fetchAgentRubric(agentName),
        fetchAgentScan(agentName),
        fetchAgentCallgraph(agentName),
        fetchAgentModel(agentName),
        fetchAgentEvidence(agentName),
        fetchAgentReport(agentName),
        fetchAgentTests(agentName),
        fetchAgentTestRun(agentName),
        fetchAgentRepro(agentName)
      ]);

      setSummaryData(sum);
      setSpecData(sp);
      setRubricData(rub);
      setScanData(scn);
      setCallgraphData(cg);
      setModelData(mdl);
      setEvidenceData(evd);
      setReportData(rpt);
      setTestsData(tst);
      setTestRunData(trun);
      setReproData(rep);
      setCurrentAgent(agentName);
      setHasLoadedAgent(true);
    } catch (err) {
      console.error('Error loading agent data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleStartRun = async (runConfig) => {
    try {
      const res = await triggerPipelineRun(runConfig);
      const targetAgent = res.agent;
      const startedAt = Date.now();
      setCurrentAgent(targetAgent);
      setRun({ agent: targetAgent, source: runConfig.source, startedAt, status: 'running', detail: 'Starting the run...', stages: [], error: null });
      setCurrentView('running');

      // Poll the backend; every poll carries the per-stage status the run screen shows.
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const st = await fetchAgentStatus(targetAgent);
          // Right after starting, the backend can still return an older finished run. Ignore that.
          const looksStale = st.status !== 'running' && !st.stages && Date.now() - startedAt < 6000;
          if (looksStale || st.status === 'idle') return;
          setRun((prev) => (prev && prev.agent === targetAgent ? {
            ...prev,
            status: st.status,
            detail: st.detail || prev.detail,
            stages: st.stages || prev.stages,
            error: st.error || null
          } : prev));
          if (st.status !== 'running') clearInterval(pollRef.current);
        } catch (pollErr) {
          clearInterval(pollRef.current);
          console.error('Polling error:', pollErr);
          setRun((prev) => (prev ? { ...prev, status: 'failed', error: 'Lost connection to the backend while the run was in progress.' } : prev));
        }
      }, 1500);
    } catch (err) {
      alert('Failed to start run: ' + err.message);
    }
  };

  const handleOpenAnalysis = async () => {
    if (!run) return;
    await loadAgentData(run.agent);
    setActiveScreenIndex(0);
    setCurrentView('analysis');
  };

  const handlePrev = () => {
    React.startTransition(() => {
      setActiveScreenIndex(prev => Math.max(0, prev - 1));
    });
  };

  const handleNext = () => {
    React.startTransition(() => {
      setActiveScreenIndex(prev => Math.min(SCREENS.length - 1, prev + 1));
    });
  };

  const currentScreenId = SCREENS[activeScreenIndex]?.id;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Dynamic Island Header with Carousel Arrows - always visible floating at top */}
      <Header
        activeScreenIndex={activeScreenIndex}
        screens={SCREENS}
        onNavigatePrev={handlePrev}
        onNavigateNext={handleNext}
        currentAgent={currentAgent}
        onNewAnalysis={() => setCurrentView('questionnaire')}
        currentView={currentView}
        onHomeClick={() => setCurrentView('landing')}
        onAgentClick={run ? () => setCurrentView('running') : undefined}
      />

      {/* Main Body */}
      <main style={{ flex: 1, paddingTop: '28px' }}>
        {/* VIEW 1: LANDING HERO (3D pipeline scene) */}
        {currentView === 'landing' && <HeroScene onStart={() => setCurrentView('questionnaire')} />}

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
            Loading outputs for {currentAgent}...
          </div>
        )}

        {/* VIEW 1b: LIVE RUN, STAGE BY STAGE */}
        {currentView === 'running' && run && (
          <RunView
            run={run}
            onOpenAnalysis={handleOpenAnalysis}
            onBackToQuestionnaire={() => setCurrentView('questionnaire')}
          />
        )}

        {/* VIEW 2: DEDICATED SETUP & REQUIREMENTS QUESTIONNAIRE PAGE */}
        {currentView === 'questionnaire' && (
          <RequirementsQuestionnaireView
            currentAgent={currentAgent}
            specData={specData}
            onBack={() => setCurrentView(hasLoadedAgent ? 'analysis' : 'landing')}
            onSaveSpec={async (agentName, spec) => {
              setSpecData(spec);
              setCurrentAgent(agentName);
            }}
            onRunPipeline={handleStartRun}
            onNavigateToSpec={() => {
              setCurrentView('analysis');
              setActiveScreenIndex(1); // Specs & Rubric
            }}
          />
        )}

        {/* VIEW 3: ANALYSIS SUITE (THE REST OF THE SITE) */}
        {currentView === 'analysis' && (
          <div className={['callgraph', 'evidence', 'model', 'test', 'summary', 'spec'].includes(currentScreenId) ? 'gt-dark-screen' : 'legacy-canvas'}>
            {isLoading && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
                Loading outputs for {currentAgent}...
              </div>
            )}

            {!isLoading && (
              <>
                {currentScreenId === 'summary' && (
                  <PipelineSummaryView
                    summaryData={summaryData}
                    onNavigateStage={(stage) => {
                      const target = stage === 'report' ? 'evidence' : stage === 'test' ? 'tests' : stage;
                      const idx = SCREENS.findIndex(s => s.id === target);
                      if (idx !== -1) {
                        React.startTransition(() => {
                          setActiveScreenIndex(idx);
                        });
                      }
                    }}
                  />
                )}

                {currentScreenId === 'spec' && (
                  <Phase0RubricView
                    specData={specData}
                    rubricData={rubricData}
                    onNavigateToQuestionnaire={() => setCurrentView('questionnaire')}
                  />
                )}

                {currentScreenId === 'scan' && (
                  <ScanToolsView
                    scanData={scanData}
                    summaryData={summaryData}
                  />
                )}

                {currentScreenId === 'callgraph' && (
                  <CallGraphView
                    callgraphData={callgraphData}
                  />
                )}

                {currentScreenId === 'model' && (
                  <BehavioralModelView
                    modelData={modelData}
                    currentAgent={currentAgent}
                  />
                )}

                {currentScreenId === 'test' && (
                  <>
                    {reproData?.overall && (
                      <div style={{ maxWidth: '1240px', margin: '16px auto 0', padding: '0 24px' }}>
                        <ReproducibilityPanel repro={reproData} />
                      </div>
                    )}
                    <TestRunsJudgeView
                      currentAgent={currentAgent}
                      rubricData={rubricData}
                    />
                  </>
                )}

                {currentScreenId === 'evidence' && (
                  <EvidenceGraphView
                    evidenceData={evidenceData}
                    reportData={reportData}
                    currentAgent={currentAgent}
                  />
                )}
              </>
            )}
          </div>
        )}
      </main>
      <footer className="gt-foot"><Logo size={22} /><span>GreatTest · agent verification</span></footer>

    </div>
  );
}

export default App;
