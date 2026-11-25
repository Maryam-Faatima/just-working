import { useEffect, useState } from 'react';

const KEY = 'gt-theme';

const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const systemTheme = () => (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
export const currentTheme = () => document.documentElement.dataset.theme || stored() || systemTheme();

function apply(t) {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#eef2fb' : '#050b24');
  window.dispatchEvent(new Event('gt-theme'));
}

// A saved choice wins; with none, the app follows the device's light/dark setting.
export function useTheme() {
  const [theme, setThemeState] = useState(currentTheme);
  useEffect(() => {
    const sync = () => setThemeState(currentTheme());
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onSystem = () => { if (!stored()) apply(systemTheme()); };
    window.addEventListener('gt-theme', sync);
    mq.addEventListener('change', onSystem);
    apply(currentTheme());
    return () => { window.removeEventListener('gt-theme', sync); mq.removeEventListener('change', onSystem); };
  }, []);
  const setTheme = (t) => { try { localStorage.setItem(KEY, t); } catch { /* private mode */ } apply(t); };
  return [theme, setTheme];
}
