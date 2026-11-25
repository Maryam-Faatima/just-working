import React, { useCallback, useEffect, useRef, useState } from 'react';

const MIN = 0.3;
const MAX = 3;
const clamp = (z) => Math.min(MAX, Math.max(MIN, Math.round(z * 1000) / 1000));

// Wraps a graph with pinch / Ctrl+scroll zoom, drag to pan, "fit" and full screen.
// The parent owns `zoom` and scales its own SVG with it.
export function GraphViewport({ zoom, setZoom, contentWidth, contentHeight, children, className = '' }) {
  const wrap = useRef(null);
  const scroller = useRef(null);
  const zoomRef = useRef(zoom);
  const [fs, setFs] = useState(false);
  const [drag, setDrag] = useState(false);
  zoomRef.current = zoom;

  const zoomAt = useCallback((next, fx, fy) => {
    const el = scroller.current;
    const old = zoomRef.current;
    const z = clamp(next);
    if (!el || z === old) return;
    const px = fx ?? el.clientWidth / 2;
    const py = fy ?? el.clientHeight / 2;
    const r = z / old;
    const sl = el.scrollLeft;
    const st = el.scrollTop;
    zoomRef.current = z;
    setZoom(z);
    requestAnimationFrame(() => {
      el.scrollLeft = (sl + px) * r - px;
      el.scrollTop = (st + py) * r - py;
    });
  }, [setZoom]);

  // Trackpad pinch (arrives as Ctrl+wheel) and two-finger touch pinch.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const rel = (cx, cy) => { const b = el.getBoundingClientRect(); return [cx - b.left, cy - b.top]; };
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const [x, y] = rel(e.clientX, e.clientY);
      zoomAt(zoomRef.current * Math.exp(-e.deltaY * 0.012), x, y);
    };
    let startDist = 0;
    let startZoom = 1;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e) => { if (e.touches.length === 2) { startDist = dist(e.touches); startZoom = zoomRef.current; } };
    const onMove = (e) => {
      if (e.touches.length !== 2 || !startDist) return;
      e.preventDefault();
      const [x, y] = rel((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      zoomAt(startZoom * (dist(e.touches) / startDist), x, y);
    };
    const onEnd = () => { startDist = 0; };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [zoomAt]);

  // Mouse drag on empty space pans the graph; boxes and buttons keep their clicks.
  const panRef = useRef(null);
  const onDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest('.cg-node, .cg-more, button, a, input')) return;
    const el = scroller.current;
    panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.setPointerCapture(e.pointerId);
    setDrag(true);
  };
  const onMoveP = (e) => {
    const p = panRef.current;
    if (!p) return;
    scroller.current.scrollLeft = p.sl - (e.clientX - p.x);
    scroller.current.scrollTop = p.st - (e.clientY - p.y);
  };
  const onUp = () => { panRef.current = null; setDrag(false); };

  // Full screen: native when available, a fixed overlay otherwise (e.g. iPhone).
  useEffect(() => {
    const h = () => { if (document.fullscreenElement === wrap.current) setFs(true); else if (!document.fullscreenElement) setFs((v) => (v === 'css' ? v : false)); };
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  useEffect(() => {
    if (fs !== 'css') return undefined;
    const k = (e) => { if (e.key === 'Escape') setFs(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [fs]);
  const toggleFs = () => {
    const el = wrap.current;
    if (fs) {
      if (document.fullscreenElement) document.exitFullscreen();
      setFs(false);
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => setFs('css'));
    } else {
      setFs('css');
    }
  };

  const fit = () => {
    const el = scroller.current;
    if (!el || !contentWidth || !contentHeight) { setZoom(1); return; }
    const h = fs ? el.clientHeight : Math.min(el.clientHeight || contentHeight, contentHeight);
    setZoom(clamp(Math.min((el.clientWidth - 12) / contentWidth, (h - 12) / contentHeight)));
    el.scrollTo(0, 0);
  };

  return (
    <div ref={wrap} className={`gt-gv ${fs === 'css' ? 'fs' : ''} ${className}`}>
      <div className="gt-gv-ctl" role="toolbar" aria-label="Graph view controls">
        <button type="button" onClick={() => zoomAt(zoomRef.current / 1.25)} title="Zoom out" aria-label="Zoom out">−</button>
        <span title="Pinch, or Ctrl + scroll, to zoom. Drag to move.">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => zoomAt(zoomRef.current * 1.25)} title="Zoom in" aria-label="Zoom in">+</button>
        <button type="button" onClick={fit} title="Fit to screen" aria-label="Fit to screen">Fit</button>
        <button type="button" onClick={toggleFs} title={fs ? 'Exit full screen' : 'Full screen'} aria-label={fs ? 'Exit full screen' : 'Full screen'}>{fs ? '✕' : '⛶'}</button>
      </div>
      <div
        ref={scroller}
        className={`gt-gv-scroll${drag ? ' drag' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMoveP}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {children}
      </div>
    </div>
  );
}
