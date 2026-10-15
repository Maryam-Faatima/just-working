import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { PipelineSummaryView } from './components/PipelineSummaryView';
import { Phase0RubricView } from './components/Phase0RubricView';
import { ScanToolsView } from './components/ScanToolsView';
import { CallGraphView } from './components/CallGraphView';
import { BehavioralModelView } from './components/BehavioralModelView';
import { EvidenceGraphView } from './components/EvidenceGraphView';
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
  { id: 'evidence', label: 'Evidence Graph' }
];

function App() {
  const [currentView, setCurrentView] = useState('landing'); // 'landing' | 'questionnaire' | 'analysis'
  const [activeScreenIndex, setActiveScreenIndex] = useState(0);
  const [currentAgent, setCurrentAgent] = useState('');
  const [hasLoadedAgent, setHasLoadedAgent] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

  // Loaded outputs for the analyzed agent
  const [summaryData, setSummaryData] = useState(null);
  const [specData, setSpecData] = useState(null);
  const [rubricData, setRubricData] = useState(null);
  const [scanData, setScanData] = useState(null);
  const [callgraphData, setCallgraphData] = useState(null);
  const [modelData, setModelData] = useState(null);
  const [evidenceData, setEvidenceData] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [runStatusMessage, setRunStatusMessage] = useState(null);

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
      const [sum, sp, rub, scn, cg, mdl, evd, rpt] = await Promise.all([
        fetchAgentSummary(agentName),
        fetchAgentSpec(agentName),
        fetchAgentRubric(agentName),
        fetchAgentScan(agentName),
        fetchAgentCallgraph(agentName),
        fetchAgentModel(agentName),
        fetchAgentEvidence(agentName),
        fetchAgentReport(agentName)
      ]);

      setSummaryData(sum);
      setSpecData(sp);
      setRubricData(rub);
      setScanData(scn);
      setCallgraphData(cg);
      setModelData(mdl);
      setEvidenceData(evd);
      setReportData(rpt);
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
      setRunStatusMessage(`Initiating run for ${runConfig.source}...`);
      const res = await triggerPipelineRun(runConfig);
      const targetAgent = res.agent;
      setCurrentAgent(targetAgent);

      // Poll status until done
      const interval = setInterval(async () => {
        try {
          const status = await fetchAgentStatus(targetAgent);
          if (status.status === 'running') {
            setRunStatusMessage(status.detail || 'Running pipeline stages...');
          } else if (status.status === 'failed') {
            clearInterval(interval);
            setRunStatusMessage(null);
            alert(`Pipeline run failed: ${status.error || status.detail || 'Unknown error'}`);
          } else {
            clearInterval(interval);
            setRunStatusMessage(null);
            await loadAgentData(targetAgent);
            setActiveScreenIndex(0); // Show Pipeline summary
            setCurrentView('analysis');
          }
        } catch (pollErr) {
          clearInterval(interval);
          setRunStatusMessage(null);
          console.error('Polling error:', pollErr);
        }
      }, 1500);
    } catch (err) {
      alert('Failed to start run: ' + err.message);
      setRunStatusMessage(null);
    }
  };

  const handlePrev = () => {
    setActiveScreenIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setActiveScreenIndex(prev => Math.min(SCREENS.length - 1, prev + 1));
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
      />

      {/* Main Body */}
      <main style={{ flex: 1, paddingTop: '28px' }}>
        {/* VIEW 1: LANDING HERO */}
        {currentView === 'landing' && (
          <div className="animate-fade-in landing-hero-grid" style={{
            maxWidth: '1240px',
            margin: '40px auto 80px',
            padding: '0 24px',
            display: 'grid',
            gridTemplateColumns: '1.15fr 0.85fr',
            gap: '48px',
            alignItems: 'center'
          }}>
            {/* Left Big Typographic Hero */}
            <div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                color: 'var(--accent)',
                fontSize: '11px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                marginBottom: '16px'
              }}>
                AGENT CONFIGURATION
              </div>

              <h1 style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '54px',
                fontWeight: 800,
                color: 'var(--ink-primary)',
                lineHeight: 1.12,
                letterSpacing: '-1.4px',
                marginBottom: '22px'
              }}>
                Welcome to GreatTest<span style={{ color: 'var(--accent)' }}>.</span>{' '}
                <span className="text-gradient-brand" style={{ display: 'block' }}>
                  Analyze & verify your agent.
                </span>
              </h1>

              <p style={{
                fontSize: '16.5px',
                color: 'var(--ink-secondary)',
                lineHeight: 1.6,
                marginBottom: '36px',
                maxWidth: '520px'
              }}>
                Statically extract tools, graph routes, and call trees from any Python agent repository. Synthesize Phase 0 developer requirements and generate actionable evaluation rubrics.
              </p>

              {/* Single Clear Action Button */}
              <div>
                <button
                  onClick={() => setCurrentView('questionnaire')}
                  style={{
                    border: 'none',
                    background: '#000000',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '15px',
                    padding: '14px 34px',
                    borderRadius: 'var(--radius-full)',
                    cursor: 'pointer',
                    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.22)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 14px 30px rgba(0, 0, 0, 0.28)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.22)';
                  }}
                >
                  Configure & Run Pipeline →
                </button>
              </div>
            </div>

            {/* Right Column: 3D Flip Card with Ambient Orange Radial Glow */}
            <div style={{ position: 'relative', maxWidth: '520px', width: '100%', justifySelf: 'center', marginTop: '20px' }}>
              {/* Warm Radial Orange Glow */}
              <div className="flip-card-glow" />

              {/* Interactive Flip Card Container (Identical size on both front & back) */}
              <div
                className={`flip-card-wrapper ${isFlipped ? 'flipped' : ''}`}
                onMouseEnter={() => setIsFlipped(true)}
                onMouseLeave={() => setIsFlipped(false)}
                onClick={() => setIsFlipped(!isFlipped)}
                style={{ cursor: 'pointer' }}
              >
                <div className="flip-card-inner" style={{ height: '380px' }}>

                  {/* FRONT FACE: Code Terminal */}
                  <div className="flip-card-front" style={{
                    height: '380px',
                    background: '#0D0D11',
                    border: '1.5px solid rgba(255,255,255,0.12)',
                    boxShadow: 'var(--shadow-float)',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxSizing: 'border-box'
                  }}>
                    {/* Terminal Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 18px',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255, 255, 255, 0.04)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#A3A3A3', marginLeft: '8px', fontWeight: 500 }}>
                          agent_verification_suite.py
                        </span>
                      </div>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: 'var(--accent)',
                        background: 'rgba(224, 93, 56, 0.15)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)'
                      }}>
                        Hover to inspect results ↺
                      </span>
                    </div>

                    {/* Code Body */}
                    <pre style={{
                      padding: '18px 20px',
                      margin: 0,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11.5px',
                      lineHeight: 1.6,
                      color: '#EDEDED',
                      flex: 1,
                      overflowY: 'auto'
                    }}>
                      <span style={{ color: '#E05D38' }}>from</span> greattest <span style={{ color: '#E05D38' }}>import</span> GreatTestPipeline{'\n\n'}
                      pipeline = GreatTestPipeline(agent_target=<span style={{ color: '#FCD34D' }}>"./trip-planner-agent"</span>){'\n'}
                      tools = pipeline.run_stage_scan(){'\n'}
                      callgraph = pipeline.run_stage_callgraph(){'\n\n'}
                      <span style={{ color: '#737373' }}># Synthesize developer invariant rubric</span>{'\n'}
                      rubric = pipeline.synthesize_rubric(phase0_answers){'\n'}
                      model = pipeline.synthesize_model_v0(){'\n\n'}
                      <span style={{ color: '#E05D38' }}>assert</span> len(tools) &gt; <span style={{ color: '#60A5FA' }}>0</span>
                    </pre>
                  </div>

                  {/* BACK FACE: Real Stages Summary (Exact same 380px height) */}
                  <div className="flip-card-back" style={{
                    height: '380px',
                    background: '#FFFFFF',
                    border: '1.5px solid var(--border-default)',
                    boxShadow: 'var(--shadow-float)',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxSizing: 'border-box'
                  }}>
                    <div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '14px',
                        paddingBottom: '12px',
                        borderBottom: '1px solid var(--border-subtle)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} className="animate-pulse" />
                          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink-primary)' }}>
                            Pipeline Verification Stages
                          </span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--ink-muted)', fontWeight: 600 }}>
                          5 stages configured
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                          { name: 'Phase 0 Requirements & Rubric', badge: '✓ Synthesized', desc: 'Developer invariant synthesis' },
                          { name: 'AST Tool & Graph Scan', badge: '✓ Extracted', desc: 'LangGraph nodes & decorators' },
                          { name: 'Call Graph Route Resolver', badge: '✓ Resolved', desc: 'Direct caller-callee bindings' },
                          { name: 'Behavioral Model V0', badge: '✓ Inferred', desc: 'Capabilities & state bounds' }
                        ].map((card, i) => (
                          <div
                            key={i}
                            style={{
                              background: 'var(--bg-surface-soft)',
                              border: '1.2px solid var(--border-default)',
                              borderRadius: '10px',
                              padding: '9px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--ink-primary)' }}>
                                {card.name}
                              </div>
                              <div style={{ fontSize: '10.5px', color: 'var(--ink-muted)', marginTop: '1px' }}>
                                {card.desc}
                              </div>
                            </div>
                            <span style={{
                              fontSize: '10px',
                              fontFamily: 'var(--font-heading)',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              flexShrink: 0,
                              background: 'var(--status-confirmed-bg)',
                              color: 'var(--status-confirmed)'
                            }}>
                              {card.badge}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{
                      marginTop: '10px',
                      paddingTop: '8px',
                      borderTop: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      color: 'var(--ink-faint)'
                    }}>
                      <span>Supported: Git URL · Local folder · .zip</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Hover out to view code ↺</span>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
            Loading outputs for {currentAgent}...
          </div>
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
          <>
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
                      const target = stage === 'report' ? 'evidence' : stage;
                      const idx = SCREENS.findIndex(s => s.id === target);
                      if (idx !== -1) setActiveScreenIndex(idx);
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
                  />
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
          </>
        )}
      </main>

      {/* Real-Time Run Progress Popup / Toast at Bottom */}
      {runStatusMessage && (
        <div
          className="animate-bottom-toast"
          style={{
            position: 'fixed',
            bottom: '36px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'rgba(15, 17, 23, 0.94)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1.5px solid rgba(224, 93, 56, 0.55)',
            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45), 0 0 24px rgba(224, 93, 56, 0.28)',
            borderRadius: 'var(--radius-full)',
            padding: '14px 28px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            color: '#FFFFFF',
            maxWidth: 'min(92vw, 760px)',
            whiteSpace: 'nowrap'
          }}
        >
          {/* Pulsing Glowing Orange Dot */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            width: '14px',
            height: '14px',
            flexShrink: 0
          }}>
            <span
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: 'var(--accent)',
                opacity: 0.65
              }}
              className="animate-pulse"
            />
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--accent)',
                boxShadow: '0 0 8px var(--accent)'
              }}
            />
          </div>

          {/* Status Message Text with Bigger Font */}
          <span style={{
            fontSize: '15.5px',
            fontWeight: 700,
            color: '#FFFFFF',
            letterSpacing: '-0.2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {runStatusMessage}
          </span>

          {/* Dismiss button */}
          <button
            onClick={() => setRunStatusMessage(null)}
            title="Dismiss"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.55)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '50%',
              marginLeft: '6px',
              transition: 'color 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)')}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
