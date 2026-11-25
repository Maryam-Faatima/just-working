import React, { useRef } from 'react';
import { Logo } from './Logo';

// Bottom → top: the pipeline "ascends" from requirements to evidence.
const LAYERS = [
  { tag: 'Phase 0', title: 'Requirements', sub: 'Questionnaire → rubric', kind: 'form' },
  { tag: 'Stage 1', title: 'AST scan', sub: 'Tools & graph routes', kind: 'code' },
  { tag: 'Stage 2', title: 'Call graph', sub: 'Caller → callee edges', kind: 'graph' },
  { tag: 'Stage 3', title: 'Behavioral model', sub: 'Capabilities & limits', kind: 'model' },
  { tag: 'Stage 4', title: 'Evidence graph', sub: 'Every result, traced', kind: 'evidence' }
];

const LIME = 'var(--gt-accent-text)';
const DIM = 'var(--gt-ink-faint)';

function Decor({ kind }) {
  const common = { viewBox: '0 0 240 58', fill: 'none', 'aria-hidden': true };
  switch (kind) {
    case 'form':
      return (
        <svg {...common}>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="0" y={4 + i * 19} width="12" height="12" rx="3" fill={i === 0 ? LIME : 'none'} stroke={i === 0 ? LIME : DIM} />
              <rect x="22" y={8 + i * 19} width={150 - i * 28} height="5" rx="2.5" fill={DIM} />
            </g>
          ))}
        </svg>
      );
    case 'code':
      return (
        <svg {...common}>
          {[[0, 90], [14, 140], [14, 110], [0, 70], [14, 125]].map(([x, w], i) => (
            <rect key={i} x={x} y={3 + i * 11} width={w} height="5" rx="2.5" fill={i === 1 ? LIME : DIM} />
          ))}
        </svg>
      );
    case 'graph':
      return (
        <svg {...common}>
          <path d="M20 30 L90 10 M20 30 L90 48 M90 10 L170 30 M90 48 L170 30 M170 30 L225 30" stroke={DIM} strokeWidth="1.5" />
          {[[20, 30], [90, 10], [90, 48], [170, 30], [225, 30]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === 3 ? 7 : 5} fill={i === 3 ? LIME : 'var(--gt-bg)'} stroke={i === 3 ? LIME : DIM} strokeWidth="1.5" />
          ))}
        </svg>
      );
    case 'model':
      return (
        <svg {...common}>
          {[[0, 78], [86, 60], [154, 86], [0, 52], [60, 90]].map(([x, w], i) => (
            <rect key={i} x={x} y={i < 3 ? 4 : 32} width={w} height="20" rx="10"
              fill={i === 2 ? 'rgba(var(--gt-cur-rgb),0.18)' : 'rgba(var(--gt-tint),0.06)'} stroke={i === 2 ? LIME : DIM} />
          ))}
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M10 29 C60 29 60 10 120 10 M10 29 C60 29 60 48 120 48 M120 10 L225 10 M120 48 C170 48 180 29 225 29" stroke={LIME} strokeWidth="1.6" opacity="0.75" />
          {[[10, 29], [120, 10], [120, 48], [225, 10], [225, 29]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" fill={i === 4 ? 'var(--gt-bad)' : LIME} />
          ))}
        </svg>
      );
  }
}

export function HeroScene({ onStart }) {
  const wrapRef = useRef(null);

  // Pointer parallax: writes CSS variables only, so React never re-renders.
  const handleMove = (e) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    el.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };
  const handleLeave = () => {
    const el = wrapRef.current;
    if (!el) return;
    el.style.setProperty('--px', 0);
    el.style.setProperty('--py', 0);
  };

  return (
    <div className="animate-fade-in gt-hero">
      <div>
        <Logo size={72} className="gt-hero-logo" />
        <div className="gt-eyebrow"><i /> Agent verification engine</div>
        <h1>
          Welcome to GreatTest.
          <em>Analyze &amp; verify your agent.</em>
        </h1>
        <p className="lead">
          Statically extract tools, graph routes, and call trees from any Python agent repository.
          Synthesize Phase 0 developer requirements and generate actionable evaluation rubrics.
        </p>
        <button className="gt-btn-lime" onClick={onStart}>Configure &amp; Run Pipeline →</button>
        <div className="meta">Git URL · Local folder · .zip upload</div>
      </div>

      <div className="gt-scene-wrap" ref={wrapRef} onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <div className="gt-scene">
          <div className="gt-shadow" />
          <div className="gt-beam" />
          {LAYERS.map((l, i) => (
            <div key={l.title} className={`gt-slab${i === LAYERS.length - 1 ? ' top' : ''}`} style={{ '--i': i }}>
              <span className="gt-slab-tag">{l.tag}</span>
              <div className="gt-slab-title">{l.title}</div>
              <div className="gt-slab-sub">{l.sub}</div>
              <Decor kind={l.kind} />
            </div>
          ))}
          {LAYERS.map((l, i) => <div key={`n${i}`} className="gt-node" style={{ '--i': i }} />)}
        </div>
      </div>
    </div>
  );
}
