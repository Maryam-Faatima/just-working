import React from 'react';

export function PipelineSummaryView({ summaryData, onNavigateStage }) {
  if (!summaryData) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '48px 24px', border: '1.5px solid var(--border-default)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink-primary)' }}>No Pipeline Execution Summary Found</h3>
          <p style={{ color: 'var(--ink-muted)', marginTop: '8px' }}>Launch a pipeline scan to view stage-by-stage diagnostics.</p>
        </div>
      </div>
    );
  }

  const stages = summaryData.stages || [];
  const totalSeconds = stages.reduce((acc, s) => acc + (s.seconds || 0), 0).toFixed(2);
  const okStages = stages.filter(s => s.status === 'ok').length;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto 80px', padding: '0 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
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
          <span>✦</span> Pipeline Orchestrator Summary
        </div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '30px', fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.6px' }}>
          Agent Pipeline Execution Run
        </h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '14.5px', marginTop: '4px' }}>
          Diagnostic timeline of all completed and pending stages in GreatTest.
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '28px'
      }}>
        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Target Agent</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '4px' }}>
            {summaryData.agent}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px', wordBreak: 'break-all' }}>
            {summaryData.source || 'local folder'}
          </div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--status-confirmed)', textTransform: 'uppercase' }}>Pipeline Status</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 800, color: summaryData.ok ? 'var(--status-confirmed)' : 'var(--status-contradicted)', marginTop: '4px' }}>
            {summaryData.ok ? 'SUCCESS (OK)' : 'DEGRADED'}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>
            {okStages} of {stages.length} stages completed
          </div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Total Execution Time</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 800, color: 'var(--accent)', marginTop: '4px' }}>
            {totalSeconds}s
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>across all subroutines</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Repository Commit</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '6px' }}>
            {summaryData.commit ? summaryData.commit.substring(0, 10) : 'local workspace'}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>git HEAD checksum</div>
        </div>
      </div>

      {/* Stage-by-Stage Detailed Timeline */}
      <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)', marginBottom: '18px' }}>
          Pipeline Stage Sequence & Execution Details
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {stages.map((stg, idx) => {
            const isOk = stg.status === 'ok';
            const isSkipped = stg.status === 'skipped';
            const isFailed = stg.status === 'failed';

            return (
              <div
                key={idx}
                style={{
                  background: 'var(--bg-surface-soft)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: isOk ? '#DCFCE7' : isSkipped ? 'var(--bg-inset)' : '#FEE2E2',
                    color: isOk ? '#16A34A' : isSkipped ? 'var(--ink-muted)' : '#DC2626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {idx + 1}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ink-primary)', textTransform: 'capitalize' }}>
                        {stg.stage}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '4px',
                        background: isOk ? '#DCFCE7' : isSkipped ? 'var(--bg-inset)' : '#FEE2E2',
                        color: isOk ? '#16A34A' : isSkipped ? 'var(--ink-muted)' : '#DC2626',
                        textTransform: 'uppercase'
                      }}>
                        {stg.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--ink-secondary)', marginTop: '2px' }}>
                      {stg.detail}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink-muted)' }}>
                    {stg.seconds}s
                  </span>
                  {onNavigateStage && ['spec', 'scan', 'callgraph', 'model'].includes(stg.stage) && (
                    <button
                      onClick={() => onNavigateStage(stg.stage)}
                      style={{
                        border: '1px solid var(--border-default)',
                        background: '#fff',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-full)',
                        cursor: 'pointer',
                        color: 'var(--ink-primary)'
                      }}
                    >
                      View →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
