import React from 'react';

export function Header({
  activeScreenIndex,
  screens,
  onNavigatePrev,
  onNavigateNext,
  currentAgent,
  onNewAnalysis
}) {
  const currentScreen = screens[activeScreenIndex] || screens[0];
  const canGoPrev = activeScreenIndex > 0;
  const canGoNext = activeScreenIndex < screens.length - 1;

  return (
    <header style={{
      position: 'sticky',
      top: '14px',
      zIndex: 50,
      width: '100%',
      padding: '0 20px',
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px'
    }}>
      {/* Clean Dynamic Island Container */}
      <div style={{
        maxWidth: '1100px',
        width: '100%',
        margin: '0 auto',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1.5px solid var(--border-island)',
        borderRadius: 'var(--radius-full)',
        padding: '7px 20px',
        boxShadow: 'var(--shadow-island)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        pointerEvents: 'auto',
        transition: 'all 0.2s ease'
      }}>
        {/* Left: Brand & Target Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src="/logo.png"
            alt="GreatTest Logo"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              objectFit: 'contain',
              display: 'block'
            }}
          />
          <div style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '16.5px',
            fontWeight: 800,
            letterSpacing: '-0.3px',
            color: 'var(--ink-primary)'
          }}>
            GreatTest<span style={{ color: 'var(--accent)' }}>.</span>
          </div>

          {currentAgent ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-inset)',
              padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-subtle)'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-confirmed)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                {currentAgent}
              </span>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#FEF3C7',
              padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid #F59E0B'
            }}>
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#92400E' }}>
                SIMULATION (mock data)
              </span>
            </div>
          )}
        </div>

        {/* Center: Stage Carousel (Prev/Next Arrows + Active Stage Display) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onNavigatePrev}
            disabled={!canGoPrev}
            style={{
              border: '1px solid var(--border-default)',
              background: canGoPrev ? '#fff' : 'var(--bg-inset)',
              color: canGoPrev ? 'var(--ink-primary)' : 'var(--ink-faint)',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: canGoPrev ? 'pointer' : 'not-allowed',
              fontWeight: 800,
              fontSize: '14px',
              transition: 'all 0.15s ease'
            }}
            title="Previous Stage"
          >
            ←
          </button>

          <div style={{
            background: 'var(--bg-inset)',
            padding: '5px 16px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: '220px',
            justifyContent: 'center'
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 800,
              color: 'var(--accent)',
              background: '#fff',
              padding: '2px 6px',
              borderRadius: '4px'
            }}>
              Phase {activeScreenIndex + 1}/{screens.length}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink-primary)' }}>
              {currentScreen.label}
            </span>
          </div>

          <button
            onClick={onNavigateNext}
            disabled={!canGoNext}
            style={{
              border: '1px solid var(--border-default)',
              background: canGoNext ? '#fff' : 'var(--bg-inset)',
              color: canGoNext ? 'var(--ink-primary)' : 'var(--ink-faint)',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: canGoNext ? 'pointer' : 'not-allowed',
              fontWeight: 800,
              fontSize: '14px',
              transition: 'all 0.15s ease'
            }}
            title="Next Stage"
          >
            →
          </button>
        </div>

        {/* Right: New Analysis Button */}
        <div>
          <button
            onClick={onNewAnalysis}
            style={{
              border: 'none',
              background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12px',
              padding: '7px 18px',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          >
            <span>+</span> Run New Agent
          </button>
        </div>
      </div>
    </header>
  );
}
