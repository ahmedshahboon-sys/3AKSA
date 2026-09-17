import { useCallback, useEffect, useState } from 'react';

export type AppTheme = 'system' | 'light' | 'dark' | 'pink-light' | 'pink-dark';

const STORAGE_KEY = '3aksa:theme';
const allowedThemes: AppTheme[] = ['system', 'light', 'dark', 'pink-light', 'pink-dark'];

function isAppTheme(value: string | null): value is AppTheme {
  return value !== null && allowedThemes.includes(value as AppTheme);
}

function resolveMode(theme: AppTheme): 'light' | 'dark' {
  if (theme === 'light' || theme === 'pink-light') return 'light';
  if (theme === 'dark' || theme === 'pink-dark') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolveThemeColor(theme: AppTheme) {
  const mode = resolveMode(theme);
  if (theme.startsWith('pink-')) return mode === 'dark' ? '#151216' : '#fff7fb';
  return mode === 'dark' ? '#111315' : '#f7f8fa';
}

export function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.dataset.mode = resolveMode(theme);
  root.dataset.palette = theme.startsWith('pink-') ? 'pink' : 'main';
  root.style.colorScheme = root.dataset.mode;
  const metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = resolveThemeColor(theme);
}

export function getInitialTheme(): AppTheme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isAppTheme(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function useAppTheme() {
  const [theme, setThemeState] = useState<AppTheme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    const media = window.matchMedia('(prefers-color-scheme: light)');
    if (theme !== 'system') return;
    const syncSystemTheme = () => applyTheme('system');
    media.addEventListener('change', syncSystemTheme);
    return () => media.removeEventListener('change', syncSystemTheme);
  }, [theme]);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    try { window.localStorage.setItem(STORAGE_KEY, nextTheme); } catch { /* best effort */ }
    setThemeState(nextTheme);
  }, []);

  return { theme, setTheme };
}
