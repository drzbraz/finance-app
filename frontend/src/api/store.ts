import { useEffect, useSyncExternalStore } from 'react';

/**
 * A tiny cache for server data, standing in for Dexie's live queries: each hook reads one key,
 * and every mutation invalidates the keys it changed, so all screens showing them refetch.
 * Stale data stays on screen while the fresh copy loads.
 */
interface Entry {
  data?: unknown;
  error?: Error;
  fetcher: () => Promise<unknown>;
  /** The fetch in progress; invalidating during it marks the entry stale, so it fetches again. */
  inflight?: Promise<void>;
  stale: boolean;
}

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  listeners.get(key)?.forEach((listener) => listener());
}

/** Fetches `key`; resolves once the data is at least as new as the moment of the call. */
async function load(key: string): Promise<void> {
  const entry = entries.get(key);
  if (!entry) return;
  if (entry.inflight) {
    // A write may have happened after the running fetch read the data: fetch once more.
    entry.stale = true;
    return entry.inflight;
  }
  entry.inflight = (async () => {
    do {
      entry.stale = false;
      try {
        entry.data = await entry.fetcher();
        entry.error = undefined;
      } catch (error) {
        entry.error = error as Error;
      }
    } while (entry.stale);
    entry.inflight = undefined;
    notify(key);
  })();
  return entry.inflight;
}

function subscribe(key: string, listener: () => void): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(listener);
  return () => listeners.get(key)!.delete(listener);
}

/** The cached value for `key` (undefined until the first response), fetched on first use. */
export function useQuery<T>(key: string, fetcher: () => Promise<T>): T | undefined {
  if (!entries.has(key)) entries.set(key, { fetcher, stale: false });
  else entries.get(key)!.fetcher = fetcher;

  const data = useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => entries.get(key)?.data,
  );
  useEffect(() => {
    const entry = entries.get(key);
    // First use, or a retry after a failed request (e.g. the server was down).
    if (entry && (entry.data === undefined || entry.error)) void load(key);
  }, [key]);
  return data as T | undefined;
}

/** Refetches every cached key that starts with one of the prefixes ('' = everything). */
export async function invalidate(...prefixes: string[]): Promise<void> {
  const keys = [...entries.keys()].filter((key) => prefixes.some((prefix) => key.startsWith(prefix)));
  await Promise.all(keys.map(load));
}

/** Forgets everything; for tests. */
export function resetStore(): void {
  entries.clear();
}
