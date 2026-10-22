import { useCallback, useEffect, useRef, useState } from 'react';
import { PAGES, type PageId } from './components/layout/nav';

/** What the screen shows; kept in the URL hash so a reload stays put and Back/Forward work. */
export interface Route {
  page: PageId;
  year: number;
  month: number;
  /** Transações opened on one category. */
  category?: string;
}

const PAGE_IDS = new Set(PAGES.map((p) => p.id));

/** "#/transactions/2026/9?categoria=Lazer" → Route; anything missing or invalid falls back. */
export function parseRoute(hash: string, fallback: Route): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [page, year, month] = path.split('/');
  const y = Number(year);
  const m = Number(month);
  const category = new URLSearchParams(query).get('categoria') ?? undefined;
  return {
    page: PAGE_IDS.has(page as PageId) ? (page as PageId) : fallback.page,
    year: Number.isInteger(y) && y >= 1900 && y <= 2100 ? y : fallback.year,
    month: Number.isInteger(m) && m >= 1 && m <= 12 ? m : fallback.month,
    ...(category && { category }),
  };
}

export function routeHash({ page, year, month, category }: Route): string {
  return `#/${page}/${year}/${month}${category ? `?categoria=${encodeURIComponent(category)}` : ''}`;
}

/**
 * The route, read from and written to the hash. A new page is a new history entry (Back returns
 * to the previous screen); moving between months replaces the entry, so Back does not walk
 * through every month you looked at.
 */
export function useRoute(fallback: Route): [Route, (next: Partial<Route>) => void] {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash, fallback));

  useEffect(() => {
    const sync = () => setRoute((current) => parseRoute(window.location.hash, current));
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  useEffect(() => {
    const hash = routeHash(route);
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [route]);

  // Navigations in the same tick build on each other, and the history is written once per call.
  const latest = useRef(route);
  latest.current = route;
  const navigate = useCallback((next: Partial<Route>) => {
    const current = latest.current;
    const merged: Route = { ...current, ...next };
    // The category filter belongs to the visit that asked for it.
    if (!('category' in next)) delete merged.category;
    if (merged.page !== current.page) window.history.pushState(null, '', routeHash(merged));
    latest.current = merged;
    setRoute(merged);
  }, []);

  return [route, navigate];
}
