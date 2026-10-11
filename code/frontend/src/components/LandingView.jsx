import React, { useState } from 'react';

export function LandingView({ onStartTesting }) {
  const [isFlipped, setIsFlipped] = useState(false);

  const simulationCards = [
    {
      name: 'Adversarial cancel probe',
      status: 'fail',
      badge: '✕ Breach',
      category: 'Constraint'
    },
    {
      name: 'Flight inventory lookup',
      status: 'pass',
      badge: '✓ Pass',
      category: 'Nominal'
    },
    {
      name: 'Negative passengers (-3)',
      status: 'pass',
      badge: '✓ Pass',
      category: 'Boundary'
    }
  ];

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '90px' }}>
      {/* Hero Section */}
      <section style={{
        maxWidth: '1240px',
        margin: '18px auto 70px',
        padding: '0 24px',
        display: 'grid',
        gridTemplateColumns: '1.15fr 0.85fr',
        gap: '48px',
        alignItems: 'center'
      }}>
        {/* Left Column: Clean, concise, punchy */}
        <div>
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '52px',
            fontWeight: 800,
            color: 'var(--ink-primary)',
            lineHeight: 1.15,
            letterSpacing: '-1.4px',
            marginBottom: '20px'
          }}>
            Verify conversational AI agents{' '}
            <span className="text-gradient-brand">
              under active pressure.
            </span>
          </h1>

          <p style={{
            fontSize: '17px',
            color: 'var(--ink-secondary)',
            lineHeight: 1.6,
            marginBottom: '32px',
            maxWidth: '500px',
            fontWeight: 400
          }}>
            Statically extract your agent's behavioural model and automatically stress-test it against adversarial dialogues.
          </p>

          {/* Action Button: Single, clear, prominent CTA */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={onStartTesting}
              style={{
                border: 'none',
                background: '#000000',
                color: '#fff',
                fontWeight: 700,
                fontSize: '14.5px',
                padding: '14px 28px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.22)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.28)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.22)';
              }}
            >
              Start Testing →
            </button>
          </div>
        </div>

        {/* Right Column: Single 3D Flip Card with Ambient Glow */}
        <div style={{ position: 'relative', maxWidth: '520px', width: '100%', justifySelf: 'center', marginTop: '16px' }}>
          {/* Warm Orange-Charcoal Gradient Glow behind the card */}
          <div className="flip-card-glow" />

          {/* Interactive Flip Card Container */}
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
                background: '#000000',
                border: '1.5px solid rgba(255,255,255,0.12)',
                boxShadow: 'var(--shadow-float)',
                display: 'flex',
                flexDirection: 'column'
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
                    Hover to view results ↺
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
                  flex: 1
                }}>
                  <span style={{ color: '#E05D38' }}>from</span> greattest <span style={{ color: '#E05D38' }}>import</span> BehavioralVerifier{'\n\n'}
                  verifier = BehavioralVerifier(target=<span style={{ color: '#FCD34D' }}>"./agents/booking_agent"</span>){'\n'}
                  model = verifier.extract_behavioral_model(){'\n\n'}
                  <span style={{ color: '#737373' }}># Stress-test mandatory user confirmation</span>{'\n'}
                  trace = <span style={{ color: '#E05D38' }}>await</span> verifier.run_adversarial_dialogue({'\n'}
                  {'    '}capability=<span style={{ color: '#FCD34D' }}>"cancel_booking"</span>,{'\n'}
                  {'    '}persona=<span style={{ color: '#FCD34D' }}>"Manipulative Traveler"</span>,{'\n'}
                  {'    '}invariant=<span style={{ color: '#FCD34D' }}>"Must confirm before calling tool"</span>{'\n'}
                  ){'\n'}
                  <span style={{ color: '#E05D38' }}>assert</span> trace.confirmation_occurred == <span style={{ color: '#60A5FA' }}>True</span>
                </pre>
              </div>

              {/* BACK FACE: Simulation Results */}
              <div className="flip-card-back" style={{
                background: '#FFFFFF',
                border: '1.5px solid var(--border-default)',
                boxShadow: 'var(--shadow-float)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
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
                        Live Simulation Output
                      </span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--ink-muted)', fontWeight: 600 }}>
                      4 specs evaluated
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {simulationCards.map((card, i) => (
                      <div
                        key={i}
                        style={{
                          background: card.status === 'fail' ? 'var(--status-contradicted-bg)' : 'var(--bg-surface-soft)',
                          border: `1.2px solid ${card.status === 'fail' ? 'var(--status-contradicted-border)' : 'var(--border-default)'}`,
                          borderRadius: '10px',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px'
                        }}
                      >
                        <span style={{
                          fontWeight: 600,
                          fontSize: '12px',
                          color: card.status === 'fail' ? 'var(--status-contradicted)' : 'var(--ink-primary)'
                        }}>
                          {card.name}
                        </span>
                        <span style={{
                          fontSize: '10.5px',
                          fontFamily: 'var(--font-heading)',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          flexShrink: 0,
                          background: card.status === 'pass' ? 'var(--status-confirmed-bg)' : card.status === 'fail' ? 'var(--status-contradicted)' : 'var(--status-discovered-bg)',
                          color: card.status === 'fail' ? '#fff' : card.status === 'pass' ? 'var(--status-confirmed)' : 'var(--status-discovered)'
                        }}>
                          {card.badge}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{
                  marginTop: '12px',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '11px',
                  color: 'var(--ink-faint)'
                }}>
                  <span>Status: 1 Contradiction Detected</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Hover out to view code ↺</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section: Clean, Glassmorphic, No Long Paragraphs */}
      <section style={{
        maxWidth: '1240px',
        margin: '60px auto 70px',
        padding: '0 24px'
      }}>
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '32px',
            fontWeight: 800,
            color: 'var(--ink-primary)',
            letterSpacing: '-0.8px'
          }}>
            How it works
          </h2>
        </div>

        {/* 2 Clean Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px'
        }}>
          {/* Step 1 */}
          <div className="glass-panel" style={{ padding: '32px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px'
            }}>
              <span style={{
                background: '#000000',
                color: '#FFFFFF',
                fontFamily: 'var(--font-heading)',
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                letterSpacing: '0.4px',
                textTransform: 'uppercase'
              }}>
                STEP 01
              </span>
              <span style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '12px',
                fontWeight: 800,
                color: 'var(--ink-primary)',
                letterSpacing: '0.5px',
                textTransform: 'uppercase'
              }}>
                STATIC ANALYSIS
              </span>
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink-primary)', marginBottom: '10px' }}>
              Model Extraction
            </h3>
            <p style={{ fontSize: '14.5px', color: 'var(--ink-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
              Scans your source code, decorators, and system prompts to map every capability and tool constraint.
            </p>
            <div style={{
              background: 'var(--bg-inset)',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-secondary)'
            }}>
              cancel_booking() → rule: "Requires confirmation"
            </div>
          </div>

          {/* Step 2 */}
          <div className="glass-panel" style={{ padding: '32px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px'
            }}>
              <span style={{
                background: 'var(--accent)',
                color: '#FFFFFF',
                fontFamily: 'var(--font-heading)',
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                letterSpacing: '0.4px',
                textTransform: 'uppercase'
              }}>
                STEP 02
              </span>
              <span style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '12px',
                fontWeight: 800,
                color: 'var(--accent)',
                letterSpacing: '0.5px',
                textTransform: 'uppercase'
              }}>
                ADVERSARIAL STRESS-TEST
              </span>
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink-primary)', marginBottom: '10px' }}>
              Dynamic Dialogue
            </h3>
            <p style={{ fontSize: '14.5px', color: 'var(--ink-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
              Pressures your agent with adversarial user personas to detect unconfirmed actions and rule violations.
            </p>
            <div style={{
              background: 'var(--status-contradicted-bg)',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--status-contradicted)',
              fontWeight: 600
            }}>
              Breach detected: tool ran without confirmation
            </div>
          </div>
        </div>
      </section>

      {/* Features Section: 3 Crisp, Punchy Glassmorphic Cards */}
      <section style={{
        maxWidth: '1240px',
        margin: '0 auto 60px',
        padding: '0 24px'
      }}>
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '32px',
            fontWeight: 800,
            color: 'var(--ink-primary)',
            letterSpacing: '-0.8px'
          }}>
            Features
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '20px'
        }}>
          <div className="glass-panel" style={{ padding: '26px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#000000',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h8l-2 8 10-12h-8l2-8z" />
              </svg>
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '8px' }}>
              Adversarial Personas
            </h3>
            <p style={{ fontSize: '13.5px', color: 'var(--ink-secondary)', lineHeight: 1.55 }}>
              Hostile, urgent customer personas crafted to challenge defined safety boundaries.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '26px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--accent-light)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '8px' }}>
              Latent Tool Discovery
            </h3>
            <p style={{ fontSize: '13.5px', color: 'var(--ink-secondary)', lineHeight: 1.55 }}>
              Detects undocumented tools and unexpected capabilities called during runtime.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '26px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#000000',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '8px' }}>
              Evidence Trace Graph
            </h3>
            <p style={{ fontSize: '13.5px', color: 'var(--ink-secondary)', lineHeight: 1.55 }}>
              Grounds every failure directly to source code lines and reproducible test traces.
            </p>
          </div>
        </div>

        {/* Minimal Bottom CTA Box */}
        <div style={{
          marginTop: '48px',
          background: '#000000',
          borderRadius: 'var(--radius-xl)',
          padding: '36px 44px',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px',
          boxShadow: 'var(--shadow-float)'
        }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '22px', fontWeight: 700, marginBottom: '6px' }}>
              Ready to verify your conversational agent?
            </h3>
            <p style={{ fontSize: '14px', color: '#A3A3A3' }}>
              Connect your repository or run the benchmark flight agent fixture.
            </p>
          </div>

          <button
            onClick={onStartTesting}
            style={{
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '14px',
              padding: '13px 26px',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(224, 93, 56, 0.45)',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
          >
            Start Testing →
          </button>
        </div>
      </section>
    </div>
  );
}
