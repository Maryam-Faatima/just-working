import React from 'react';

// The GreatTest logo. It has a white background, so it sits on a small light tile
// that stays readable in both the dark and the light theme.
export function Logo({ size = 36, tile = true, className = '' }) {
  return (
    <img
      className={`gt-logo${tile ? ' tile' : ''} ${className}`.trim()}
      src="/logo.png"
      alt="GreatTest logo"
      style={{ height: `${size}px` }}
      draggable="false"
    />
  );
}
