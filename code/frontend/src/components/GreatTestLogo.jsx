import React from 'react';

export function GreatTestLogo({ size = 32, withGlow = true }) {
  return (
    <div style={{
      width: `${size}px`,
      height: `${size}px`,
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      filter: withGlow ? 'drop-shadow(0 2px 8px rgba(224, 93, 56, 0.28))' : 'none'
    }}>
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="gtApexGrad" x1="12" y1="12" x2="36" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF7A54" />
            <stop offset="100%" stopColor="#E05D38" />
          </linearGradient>
          <linearGradient id="gtCheckGrad" x1="20" y1="30" x2="37" y2="12" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E05D38" />
            <stop offset="100%" stopColor="#FFA07A" />
          </linearGradient>
        </defs>

        {/* Squircle Tile Surface */}
        <rect width="48" height="48" rx="12" fill="#111827" />
        <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="11.25" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />

        {/* Autonomous Agent Graph Nodes (Lower Sector) */}
        <line x1="16" y1="32" x2="24" y2="36" stroke="rgba(251,246,238,0.4)" strokeWidth="1.5" strokeDasharray="2 1.5" />
        <line x1="24" y1="36" x2="33" y2="31" stroke="rgba(251,246,238,0.4)" strokeWidth="1.5" />
        <line x1="16" y1="32" x2="22" y2="24" stroke="rgba(251,246,238,0.25)" strokeWidth="1.2" />
        <line x1="22" y1="24" x2="24" y2="36" stroke="rgba(251,246,238,0.25)" strokeWidth="1.2" />

        <circle cx="16" cy="32" r="2.5" fill="#E05D38" />
        <circle cx="24" cy="36" r="2.8" fill="#FBF6EE" />
        <circle cx="33" cy="31" r="2.2" fill="#E05D38" />
        <circle cx="22" cy="24" r="1.8" fill="#9CA3AF" />

        {/* Verification Delta Arch */}
        <path d="M 12 28 L 22 13 L 26 19 L 20 28 Z" fill="url(#gtApexGrad)" />

        {/* Dynamic Verification Wing Sweep */}
        <path d="M 19 25 L 25 31 L 37 13 L 34 11 L 25 25 L 21 21 Z" fill="url(#gtCheckGrad)" />

        {/* Autonomous Intelligence Spark */}
        <path d="M 34 8 Q 34 11 37 11 Q 34 11 34 14 Q 34 11 31 11 Q 34 11 34 8 Z" fill="#FF7A54" />
      </svg>
    </div>
  );
}
