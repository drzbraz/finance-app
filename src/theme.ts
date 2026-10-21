import { useEffect, useState } from 'react';
import type { ThemePref } from './types';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') return media().matches ? 'dark' : 'light';
  return pref;
}

/** Applies the preference to <html> and follows the OS while on "system". Returns the resolved theme. */
export function useTheme(pref: ThemePref): 'light' | 'dark' {
  const [resolved, setResolved] = useState(() => resolveTheme(pref));
  useEffect(() => {
    const apply = () => {
      const r = resolveTheme(pref);
      document.documentElement.classList.toggle('dark', r === 'dark');
      setResolved(r);
    };
    apply();
    const m = media();
    m.addEventListener('change', apply);
    return () => m.removeEventListener('change', apply);
  }, [pref]);
  return resolved;
}

/**
 * Chart colours from the dataviz reference palette, fixed slot order (blue, orange, aqua, yellow),
 * with the steps selected for each surface.
 */
export function chartColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { series: ['#3987e5', '#d95926', '#199e70', '#c98500'], ink: '#f0efec', ink2: '#c3c2b7', muted: '#8d8c85', grid: '#343431', surface: '#1a1a19', cursor: '#242422' }
    : { series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'], ink: '#111110', ink2: '#52514e', muted: '#8a8984', grid: '#e4e3de', surface: '#ffffff', cursor: '#f1f0ec' };
}

export type ChartColors = ReturnType<typeof chartColors>;
