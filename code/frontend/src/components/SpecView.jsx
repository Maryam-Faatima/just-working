import React, { useState } from 'react';

export function SpecView({
  onProceedToTesting,
  onBackToLanding,
  availableAgents = [],
  selectedAgent = '',
  onSelectAgent,
  onRescan
}) {
  // Source selection tab: 'dragdrop' | 'git' | 'demo'
  const [sourceMode, setSourceMode] = useState('demo');
  const [draggedFile, setDraggedFile] = useState('booking_agent_v1.zip');
  const [gitUrl, setGitUrl] = useState('https://github.com/my-org/flight-booking-agent.git');

  // 5 Questionnaire states
  const [q1, setQ1] = useState('Flight Booking & Reservations');
  const [q2, setQ2] = useState('');
  const [q3, setQ3] = useState('');
  const [q4, setQ4] = useState('Politely reject and prompt user for valid inputs');
  const [q5, setQ5] = useState('');

  // Generic presets ONLY for questions with standardized patterns (Q1 & Q4)
  const q1Presets = [
    'Flight Booking & Reservations',
    'Customer Support & Helpdesk',
    'E-Commerce & Order Management',
    'Financial Advisory & Invoicing'
  ];

  const q4Presets = [
    'Politely reject and prompt user for valid inputs',
    'Halt execution and escalate to a human operator',
    'Apply safe defaults and ask user for confirmation'
  ];

  return (
    <div className="animate-fade-in" style={{
      maxWidth: '1040px',
      margin: '12px auto 80px',
      padding: '0 24px'
    }}>
      {/* Navigation Breadcrumb / Back Link */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={onBackToLanding}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--ink-muted)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: 0
          }}
        >
          ← Back to Platform Overview
        </button>
      </div>

      {/* Screen Title */}
      <div style={{ marginBottom: '32px' }}>
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
          <span>✦</span> Agent Configuration
        </div>
        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '32px',
          fontWeight: 800,
          color: 'var(--ink-primary)',
          letterSpacing: '-0.8px'
        }}>
          Connect Your Agent & Set Test Invariants
        </h1>
        <p style={{
          color: 'var(--ink-secondary)',
          fontSize: '15px',
          maxWidth: '720px',
          lineHeight: 1.55,
          marginTop: '6px'
        }}>
          Upload your agent source code, then specify your core safety invariants and boundary conditions so GreatTest knows what to evaluate.
        </p>
      </div>

      {/* Section 1: Choose Agent Source */}
      <div style={{
        background: '#fff',
        borderRadius: 'var(--radius-lg)',
        border: '1.5px solid var(--border-default)',
        padding: '26px',
        boxShadow: 'var(--shadow-card)',
        marginBottom: '26px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink-primary)' }}>
              1. Choose Agent Source Code
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
              How should GreatTest inspect your agent’s tools and signatures?
            </p>
          </div>
          <span style={{
            fontSize: '10px',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '4px',
            background: 'var(--bg-inset)',
            color: 'var(--ink-secondary)',
            letterSpacing: '0.4px'
          }}>
            CODE INGESTION
          </span>
        </div>

        {/* Source Mode Toggle Pills with Clean SVG Icons */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px'
        }}>
          <button
            type="button"
            onClick={() => setSourceMode('demo')}
            style={{
              flex: 1,
              padding: '11px 16px',
              borderRadius: 'var(--radius-md)',
              border: sourceMode === 'demo' ? '2px solid var(--accent)' : '1px solid var(--border-default)',
              background: sourceMode === 'demo' ? 'var(--accent-light)' : 'var(--bg-surface-soft)',
              color: sourceMode === 'demo' ? 'var(--accent)' : 'var(--ink-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            {/* Clean SVG Lightning Bolt */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h8l-2 8 10-12h-8l2-8z" />
            </svg>
            Sample Booking Agent (Recommended)
          </button>

          <button
            type="button"
            onClick={() => setSourceMode('dragdrop')}
            style={{
              flex: 1,
              padding: '11px 16px',
              borderRadius: 'var(--radius-md)',
              border: sourceMode === 'dragdrop' ? '2px solid var(--accent)' : '1px solid var(--border-default)',
              background: sourceMode === 'dragdrop' ? 'var(--accent-light)' : 'var(--bg-surface-soft)',
              color: sourceMode === 'dragdrop' ? 'var(--accent)' : 'var(--ink-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            {/* Clean SVG Folder */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Drag & Drop Folder / ZIP
          </button>

          <button
            type="button"
            onClick={() => setSourceMode('git')}
            style={{
              flex: 1,
              padding: '11px 16px',
              borderRadius: 'var(--radius-md)',
              border: sourceMode === 'git' ? '2px solid var(--accent)' : '1px solid var(--border-default)',
              background: sourceMode === 'git' ? 'var(--accent-light)' : 'var(--bg-surface-soft)',
              color: sourceMode === 'git' ? 'var(--accent)' : 'var(--ink-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            {/* Clean SVG Link */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Git Remote URL
          </button>
        </div>

        {/* Dynamic Source Input Content */}
        {sourceMode === 'demo' && (
          <div style={{
            background: 'var(--bg-surface-soft)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '18px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                    Target Agent:
                  </span>
                  {availableAgents && availableAgents.length > 0 ? (
                    <select
                      value={selectedAgent}
                      onChange={(e) => onSelectAgent && onSelectAgent(e.target.value)}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1.5px solid var(--border-default)',
                        background: '#fff',
                        color: 'var(--ink-primary)',
                        cursor: 'pointer'
                      }}
                    >
                      {availableAgents.map(a => (
                        <option key={a.name} value={a.name}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <code style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                      {selectedAgent}
                    </code>
                  )}
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-muted)' }}>
                  Pre-configured flight booking assistant with real tools (<code>search_flights</code>, <code>create_booking</code>, <code>cancel_booking</code>) and a planted confirmation bypass bug.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (onRescan) {
                      onRescan();
                    } else if (onProceedToTesting) {
                      onProceedToTesting({ sourceMode: 'demo', agentName: selectedAgent, triggerRun: true });
                    }
                  }}
                  style={{
                    border: '1.5px solid var(--border-default)',
                    background: '#fff',
                    color: 'var(--ink-primary)',
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-full)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                  title="Run static AST pipeline and extract Model V0"
                >
                  <span>⚡</span> Run Full Scan
                </button>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--status-confirmed)',
                  background: 'var(--status-confirmed-bg)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--status-confirmed-border)'
                }}>
                  READY TO SCAN
                </span>
              </div>
            </div>
          </div>
        )}

        {sourceMode === 'dragdrop' && (
          <div style={{
            border: '2px dashed var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            padding: '30px',
            textAlign: 'center',
            background: 'var(--bg-surface-soft)',
            cursor: 'pointer'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: '#000',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink-primary)' }}>
              Drag and drop your agent project folder or .zip file here
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '4px', marginBottom: '14px' }}>
              Supports Python, Node.js, and custom LangChain/LlamaIndex frameworks
            </div>
            <input
              type="file"
              id="fileUpload"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) setDraggedFile(e.target.files[0].name);
              }}
            />
            <label
              htmlFor="fileUpload"
              style={{
                display: 'inline-block',
                background: '#fff',
                border: '1.5px solid var(--border-default)',
                color: 'var(--ink-primary)',
                fontWeight: 600,
                fontSize: '12.5px',
                padding: '8px 18px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer'
              }}
            >
              Browse Local Files
            </label>
            {draggedFile && (
              <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, marginTop: '10px' }}>
                Selected: {draggedFile}
              </div>
            )}
          </div>
        )}

        {sourceMode === 'git' && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Repository URL (HTTPS or SSH)
            </label>
            <input
              type="text"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder="https://github.com/org/repo.git"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
                background: '#fff',
                outline: 'none'
              }}
            />
            <div style={{ fontSize: '11.5px', color: 'var(--ink-muted)', marginTop: '6px' }}>
              Public or private repositories with branch/tag detection.
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Questionnaire Form */}
      <div style={{
        background: '#fff',
        borderRadius: 'var(--radius-lg)',
        border: '1.5px solid var(--border-default)',
        padding: '26px',
        boxShadow: 'var(--shadow-card)',
        marginBottom: '26px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink-primary)' }}>
              2. Contract & Invariant Questionnaire
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
              Provide the specific safety rules you want tested, or use standard templates where available.
            </p>
          </div>
          <span style={{
            fontSize: '10px',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '4px',
            background: 'var(--accent-light)',
            color: 'var(--accent)',
            letterSpacing: '0.4px'
          }}>
            SAFETY CONTRACTS
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          
          {/* Question 1: Generic options helpful here */}
          <div style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            background: 'var(--bg-surface-soft)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--ink-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                  1
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                  What is the primary role of this agent?
                </span>
              </div>
              {q1 && (
                <button
                  type="button"
                  onClick={() => setQ1('')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ink-muted)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Clear & type custom
                </button>
              )}
            </div>

            {/* Quick generic category presets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0 10px 0' }}>
              {q1Presets.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setQ1(opt)}
                  style={{
                    border: q1 === opt ? '1.5px solid var(--accent)' : '1px solid var(--border-default)',
                    background: q1 === opt ? 'var(--accent-light)' : '#fff',
                    color: q1 === opt ? 'var(--accent)' : 'var(--ink-secondary)',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '11.5px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontWeight: q1 === opt ? 700 : 500,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={q1}
                onChange={(e) => setQ1(e.target.value)}
                placeholder="Type your agent's exact purpose or role..."
                style={{
                  width: '100%',
                  padding: '10px 32px 10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  fontSize: '13px',
                  background: '#fff',
                  outline: 'none'
                }}
              />
              {q1 && (
                <button
                  type="button"
                  onClick={() => setQ1('')}
                  title="Clear input"
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ink-faint)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '2px 4px'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Question 2: Freeform Invariant (No generic presets to avoid confusion) */}
          <div style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            background: 'var(--bg-surface-soft)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--status-confirmed)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                  2
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                  Mandatory Invariant (What must the agent ALWAYS do?)
                </span>
              </div>
              {q2 && (
                <button
                  type="button"
                  onClick={() => setQ2('')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ink-muted)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
              State the specific rule your agent must adhere to (e.g. asking confirmation, showing billing totals).
            </p>

            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={q2}
                onChange={(e) => setQ2(e.target.value)}
                placeholder="e.g. Cancellation requires explicit user confirmation before executing cancel_booking()..."
                style={{
                  width: '100%',
                  padding: '10px 32px 10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  fontSize: '13px',
                  background: '#fff',
                  outline: 'none'
                }}
              />
              {q2 && (
                <button
                  type="button"
                  onClick={() => setQ2('')}
                  title="Clear input"
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ink-faint)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '2px 4px'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Question 3: Freeform Strict Negative Rule */}
          <div style={{
            border: '1px solid var(--status-contradicted-border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            background: 'var(--status-contradicted-bg)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--status-contradicted)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                  3
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--status-contradicted)' }}>
                  Strict Negative Rule (What must NEVER happen under any circumstances?)
                </span>
              </div>
              {q3 && (
                <button
                  type="button"
                  onClick={() => setQ3('')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--status-contradicted)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'rgba(220, 38, 38, 0.85)', marginBottom: '8px' }}>
              The catastrophic failure condition GreatTest will actively try to manipulate the agent into doing.
            </p>

            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={q3}
                onChange={(e) => setQ3(e.target.value)}
                placeholder="e.g. Never call cancel_booking without confirmation or delete user records..."
                style={{
                  width: '100%',
                  padding: '10px 32px 10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--status-contradicted-border)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--status-contradicted)',
                  background: '#fff',
                  outline: 'none'
                }}
              />
              {q3 && (
                <button
                  type="button"
                  onClick={() => setQ3('')}
                  title="Clear input"
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--status-contradicted)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '2px 4px'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Question 4: Boundary Handling (Generic options are useful) */}
          <div style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            background: 'var(--bg-surface-soft)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--ink-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                  4
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                  Boundary Handling (What should happen on invalid / unexpected inputs?)
                </span>
              </div>
              {q4 && (
                <button
                  type="button"
                  onClick={() => setQ4('')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ink-muted)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Clear & type custom
                </button>
              )}
            </div>

            {/* Standard fallback presets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0 10px 0' }}>
              {q4Presets.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setQ4(opt)}
                  style={{
                    border: q4 === opt ? '1.5px solid var(--accent)' : '1px solid var(--border-default)',
                    background: q4 === opt ? 'var(--accent-light)' : '#fff',
                    color: q4 === opt ? 'var(--accent)' : 'var(--ink-secondary)',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '11.5px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontWeight: q4 === opt ? 700 : 500,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={q4}
                onChange={(e) => setQ4(e.target.value)}
                placeholder="e.g. Politely reject invalid counts and ask how many are travelling..."
                style={{
                  width: '100%',
                  padding: '10px 32px 10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  fontSize: '13px',
                  background: '#fff',
                  outline: 'none'
                }}
              />
              {q4 && (
                <button
                  type="button"
                  onClick={() => setQ4('')}
                  title="Clear input"
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ink-faint)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '2px 4px'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Question 5: Freeform Deterministic Failure Condition */}
          <div style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            background: 'var(--bg-surface-soft)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--status-discovered)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                  5
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                  What deterministic condition counts as a test failure?
                </span>
              </div>
              {q5 && (
                <button
                  type="button"
                  onClick={() => setQ5('')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ink-muted)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
              The programmatically observable violation (e.g. tool execution order, leaked argument, error code).
            </p>

            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={q5}
                onChange={(e) => setQ5(e.target.value)}
                placeholder="e.g. Tool cancel_booking() invoked before confirmation turn..."
                style={{
                  width: '100%',
                  padding: '10px 32px 10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  background: '#fff',
                  outline: 'none'
                }}
              />
              {q5 && (
                <button
                  type="button"
                  onClick={() => setQ5('')}
                  title="Clear input"
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ink-faint)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '2px 4px'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '10px'
      }}>
        <button
          onClick={onBackToLanding}
          style={{
            border: '1.5px solid var(--border-default)',
            background: '#fff',
            color: 'var(--ink-secondary)',
            fontWeight: 600,
            fontSize: '13px',
            padding: '11px 22px',
            borderRadius: 'var(--radius-full)',
            cursor: 'pointer'
          }}
        >
          ← Back
        </button>

        <button
          onClick={() => {
            const agentName = sourceMode === 'demo' ? 'booking_agent' : selectedAgent;
            onProceedToTesting && onProceedToTesting({ sourceMode, agentName, triggerRun: false });
          }}
          style={{
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '14px',
            padding: '12px 28px',
            borderRadius: 'var(--radius-full)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-glow)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          Proceed to Testing Lab →
        </button>
      </div>
    </div>
  );
}
