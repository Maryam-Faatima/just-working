import React from 'react';

export function Phase0RubricView({ specData, rubricData, onNavigateToQuestionnaire }) {
  if (!specData && !rubricData) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '48px 24px', border: '1.5px solid var(--border-default)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink-primary)' }}>No Specifications or Rubric Available</h3>
          <p style={{ color: 'var(--ink-muted)', marginTop: '8px', marginBottom: '16px' }}>Run the pipeline with Phase 0 requirements to see specifications and grading items.</p>
          {onNavigateToQuestionnaire && (
            <button
              onClick={onNavigateToQuestionnaire}
              style={{
                border: 'none',
                background: '#000',
                color: '#fff',
                fontWeight: 700,
                fontSize: '13px',
                padding: '10px 22px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer'
              }}
            >
              Open Requirements Questionnaire →
            </button>
          )}
        </div>
      </div>
    );
  }

  const rubricItems = rubricData?.items || [];
  const outOfScope = specData?.out_of_scope || [];
  const quality = specData?.quality;
  const runConfig = specData?.run_config;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto 80px', padding: '0 24px' }}>
      {/* Eyebrow Header - Clean, No "Phase 0" prefix */}
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
            Requirements & Evaluation
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '30px', fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.6px' }}>
            Specs & Rubric
          </h1>
          <p style={{ color: 'var(--ink-secondary)', fontSize: '14.5px', marginTop: '4px' }}>
            Developer-declared constraints, scope boundaries, and compiled evaluation grading items.
          </p>
        </div>

        {onNavigateToQuestionnaire && (
          <button
            onClick={onNavigateToQuestionnaire}
            style={{
              border: '1.5px solid var(--border-default)',
              background: '#fff',
              color: 'var(--ink-secondary)',
              fontWeight: 700,
              fontSize: '12.5px',
              padding: '8px 18px',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: 'var(--shadow-card)'
            }}
          >
            <span>Edit in Requirements Questionnaire</span>
            <span>↗</span>
          </button>
        )}
      </div>

      {/* 2-Column Bento Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(380px, 1.2fr)', gap: '20px', alignItems: 'start' }}>
        
        {/* Left Column: Developer Specification (spec.json) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>
              Core Purpose
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink-primary)', lineHeight: 1.4 }}>
              {specData?.purpose ? `"${specData.purpose}"` : 'Not specified'}
            </h2>

            {/* Ambiguity Policy */}
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>Ambiguity Handling:</span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                padding: '3px 9px',
                borderRadius: '4px',
                background: 'var(--bg-inset)',
                color: 'var(--ink-primary)'
              }}>
                POLICY: {specData?.ambiguity_policy?.toUpperCase() || 'ASK'}
              </span>
            </div>
          </div>

          {/* Boundaries & Out of Scope */}
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink-primary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '12px' }}>
              Prohibited & Out-of-Scope Boundaries
            </h3>
            {outOfScope.length === 0 ? (
              <p style={{ fontSize: '12.5px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                No explicit out-of-scope restrictions declared.
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {outOfScope.map((item, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: 'var(--status-contradicted-bg)',
                      border: '1px solid var(--status-contradicted-border)',
                      color: 'var(--status-contradicted)',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)'
                    }}
                  >
                    ⛔ {item}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Run & Quality Configuration */}
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink-primary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '14px' }}>
              Execution & Quality Configuration
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              <div style={{ background: 'var(--bg-surface-soft)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Interface</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {runConfig?.interface || 'python_module'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface-soft)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Repeats</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {runConfig?.repeats ?? 3} runs
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface-soft)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', gridColumn: 'span 2' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Allowed Critical Failures</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {quality?.pass_threshold?.max_critical_failures ?? 0} tolerance
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Compiled Evaluation Rubric (rubric.json) */}
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)' }}>
                Compiled Evaluation Rubric ({rubricItems.length} items)
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                Grading rules synthesized by GreatTest logic.
              </p>
            </div>
            <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', background: 'var(--bg-inset)', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
              Version {rubricData?.version || 'r1'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rubricItems.map((item, idx) => {
              const isCrit = item.severity === 'critical';
              const isMajor = item.severity === 'major';

              return (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-surface-soft)',
                    border: `1.5px solid ${isCrit ? 'var(--status-contradicted-border)' : 'var(--border-default)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        fontWeight: 800,
                        background: '#fff',
                        border: '1px solid var(--border-default)',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>
                        {item.rule_id}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: isCrit ? 'var(--status-contradicted-bg)' : isMajor ? '#FEF3C7' : 'var(--bg-inset)',
                        color: isCrit ? 'var(--status-contradicted)' : isMajor ? '#D97706' : 'var(--ink-secondary)'
                      }}>
                        {item.severity}
                      </span>
                    </div>

                    <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>
                      check: {item.check} ({item.kind})
                    </span>
                  </div>

                  <p style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink-primary)', lineHeight: 1.5, margin: 0 }}>
                    {item.description}
                  </p>

                  <div style={{ fontSize: '10.5px', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                    Source: {item.source}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
