import { useEffect } from 'react';

const HOVER = 'a, button, [role="button"], summary, label, select, .cg-node, .cg-more, .gt-tile, .gt-pill, .gt-dot, .tj-item, .cg-item, .ev-find';
const TEXT = 'input, textarea, [contenteditable="true"]';

// Mouse-only cursor: a lime dot that follows instantly and a ring that trails behind it.
// The ring grows over clickable things, squeezes on press, and ripples on click.
export default function CursorFX() {
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || calm) return undefined;

    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'gt-cur-dot';
    ring.className = 'gt-cur-ring';
    // In native full screen only that element is drawn, so the cursor must live inside it.
    const host = () => document.fullscreenElement || document.body;
    host().append(dot, ring);
    const rehome = () => { host().append(dot, ring); };
    document.addEventListener('fullscreenchange', rehome);
    document.documentElement.classList.add('gt-cursor');

    let mx = -100; let my = -100; let rx = -100; let ry = -100;
    let mode = '';
    let raf = 0;
    let shown = false;

    const setMode = (m) => {
      if (m === mode) return;
      mode = m;
      ring.dataset.mode = m;
      dot.dataset.mode = m;
    };

    const move = (e) => {
      mx = e.clientX; my = e.clientY;
      if (!shown) { shown = true; rx = mx; ry = my; dot.style.opacity = '1'; ring.style.opacity = '1'; }
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      if (t.closest(TEXT)) setMode('text');
      else if (t.closest(HOVER)) setMode('link');
      else if (t.closest('.gt-gv-scroll')) setMode('pan');
      else setMode('');
    };
    const down = (e) => {
      ring.classList.add('press');
      const r = document.createElement('div');
      r.className = 'gt-cur-ripple';
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      host().append(r);
      setTimeout(() => r.remove(), 600);
    };
    const up = () => ring.classList.remove('press');
    const leave = () => { dot.style.opacity = '0'; ring.style.opacity = '0'; shown = false; };

    const tick = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mousedown', down, { passive: true });
    window.addEventListener('mouseup', up, { passive: true });
    document.addEventListener('mouseleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      document.removeEventListener('mouseleave', leave);
      document.removeEventListener('fullscreenchange', rehome);
      document.documentElement.classList.remove('gt-cursor');
      dot.remove(); ring.remove();
    };
  }, []);
  return null;
}
