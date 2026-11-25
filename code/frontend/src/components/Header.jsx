import React from 'react';
import { Logo } from './Logo';
import { useTheme } from '../theme';

export function Header({
  activeScreenIndex,
  screens,
  onNavigatePrev,
  onNavigateNext,
  currentAgent,
  onNewAnalysis,
  currentView = 'analysis',
  onHomeClick,
  onAgentClick
}) {
  const [theme, setTheme] = useTheme();
  const currentScreen = screens[activeScreenIndex] || screens[0];
  const canGoPrev = activeScreenIndex > 0;
  const canGoNext = activeScreenIndex < screens.length - 1;

  return (
    <header className="gt-header">
      <div className="gt-island island-container">
        {/* Left: brand + current agent */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="gt-brand" onClick={onHomeClick}>
            <Logo size={36} />
            <div className="gt-brand-name">GreatTest<span>.</span></div>
          </div>
          {currentAgent && (
            <div className="gt-agent-pill" onClick={onAgentClick} style={onAgentClick ? { cursor: 'pointer' } : undefined}
              title={onAgentClick ? 'Back to the live run' : undefined}><i />{currentAgent}</div>
          )}
        </div>

        {/* Center: stage carousel or mode label */}
        <div className="gt-center">
          {currentView === 'analysis' ? (
            <>
              <button className="gt-icon-btn" onClick={onNavigatePrev} disabled={!canGoPrev} title="Previous stage">←</button>
              <div className="gt-stage-pill">
                <span className="gt-stage-tag">Phase {activeScreenIndex + 1}/{screens.length}</span>
                <span className="gt-stage-label">{currentScreen.label}</span>
              </div>
              <button className="gt-icon-btn" onClick={onNavigateNext} disabled={!canGoNext} title="Next stage">→</button>
            </>
          ) : (
            <div className="gt-stage-pill">
              <span className="gt-stage-tag">
                {currentView === 'questionnaire' ? 'Phase 0' : currentView === 'running' ? 'Live' : 'Overview'}
              </span>
              <span className="gt-stage-label">
                {currentView === 'questionnaire' ? 'Requirements Questionnaire'
                  : currentView === 'running' ? 'Pipeline run' : 'Multi-Stage Verification System'}
              </span>
            </div>
          )}
        </div>

        {/* Right: new analysis */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="gt-icon-btn gt-theme-btn"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            {theme === 'light' ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            )}
          </button>
          <button className="gt-btn-lime sm" onClick={onNewAnalysis}><span>+</span> Run New Agent</button>
        </div>
      </div>
    </header>
  );
}
