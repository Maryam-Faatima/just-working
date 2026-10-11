import React from 'react';
import { BehavioralModelPanel } from './BehavioralModelPanel';
import { StagePanel } from './StagePanel';
import { EvidenceGraphPanel } from './EvidenceGraphPanel';
import { TestQueueBar } from './TestQueueBar';

export function WorkspaceView({
  capabilities,
  metrics,
  testQueue,
  narration,
  conversationTurns,
  assertionResult,
  activeLoopStep,
  activeGraphNodes,
  activeGraphEdges,
  graphNodeTones,
  activityLogs,
  isRunning,
  isFinished,
  currentStepIndex,
  onStartTesting,
  onBackToSetup,
  onInspectCap,
  onInspectTest,
  onInspectNode
}) {
  return (
    <div className="animate-fade-in" style={{ paddingBottom: '60px' }}>
      {/* Top Banner & Breadcrumb Bar */}
      <div style={{
        maxWidth: '1440px',
        margin: '12px auto 0 auto',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <button
          onClick={onBackToSetup}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--ink-muted)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>←</span> Back to Agent Setup & Invariants
        </button>

        {/* Visible Simulation Banner */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: '#FEF3C7',
          border: '1.5px solid #F59E0B',
          color: '#92400E',
          padding: '6px 14px',
          borderRadius: 'var(--radius-full)',
          fontSize: '12px',
          fontWeight: 700,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <span style={{ fontSize: '14px' }}>⚠️</span>
          <span>SIMULATION (mock data)</span>
          <span style={{ fontWeight: 500, opacity: 0.85, fontSize: '11px' }}>
            — Static interactive demonstration until testing/ trace generator connects
          </span>
        </div>
      </div>

      {/* 3-Panel Bento Grid */}
      <div style={{
        maxWidth: '1440px',
        margin: '16px auto 0 auto',
        padding: '0 24px',
        display: 'grid',
        gridTemplateColumns: '310px 1.4fr 320px',
        gap: '18px',
        alignItems: 'stretch'
      }}>
        {/* Left: Behavioral Model */}
        <BehavioralModelPanel
          capabilities={capabilities}
          metrics={metrics}
          onInspectCap={onInspectCap}
        />

        {/* Center: Execution Stage & Conversation */}
        <StagePanel
          narration={narration}
          conversationTurns={conversationTurns}
          assertionResult={assertionResult}
          activeLoopStep={activeLoopStep}
          activityLogs={activityLogs}
        />

        {/* Right: Evidence Graph */}
        <EvidenceGraphPanel
          activeNodes={activeGraphNodes}
          activeEdges={activeGraphEdges}
          nodeTones={graphNodeTones}
          onInspectNode={onInspectNode}
        />
      </div>

      {/* Bottom Streaming Test Queue */}
      <TestQueueBar
        testQueue={testQueue}
        metrics={metrics}
        onInspectTest={onInspectTest}
      />
    </div>
  );
}
