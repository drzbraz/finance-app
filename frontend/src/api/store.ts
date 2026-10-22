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
const statusListeners = new Set<() => void>();

/** Whether the screen is still waiting for its first data, and whether the server failed to answer. */
export interface ServerStatus {
  loading: boolean;
  error: Error | null;
}

let status: ServerStatus = { loading: false, error: null };

function notify(key: string): void {
  listeners.get(key)?.forEach((listener) => listener());
  updateStatus();
}

/** Only keys a screen is showing count: a failed fetch for a page you left no longer raises the banner. */
function updateStatus(): void {
  const shown = [...entries].filter(([key]) => (listeners.get(key)?.size ?? 0) > 0).map(([, entry]) => entry);
  const loading = shown.some((e) => e.data === undefined && !e.error);
  const error = shown.find((e) => e.error)?.error ?? null;
  if (loading !== status.loading || error !== status.error) {
    status = { loading, error };
    statusListeners.forEach((listener) => listener());
  }
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
  scheduleStatus();
  return () => {
    listeners.get(key)!.delete(listener);
    scheduleStatus();
  };
}

let statusScheduled = false;

/** React re-subscribes on every render (unsubscribe, then subscribe): judge once things settle. */
function scheduleStatus(): void {
  if (statusScheduled) return;
  statusScheduled = true;
  queueMicrotask(() => {
    statusScheduled = false;
    updateStatus();
  });
}

/** The cached value for `key` (undefined until the first response), fetched on first use; a null key fetches nothing. */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>): T | undefined {
  if (key !== null && !entries.has(key)) {
    entries.set(key, { fetcher, stale: false });
    // A new key counts as loading from the first render, before its fetch starts.
    queueMicrotask(() => notify(key));
  } else if (key !== null) entries.get(key)!.fetcher = fetcher;

  const data = useSyncExternalStore(
    (listener) => (key === null ? () => {} : subscribe(key, listener)),
    () => (key === null ? undefined : entries.get(key)?.data),
  );
  useEffect(() => {
    if (key === null) return;
    const entry = entries.get(key);
    // First use, or a retry after a failed request (e.g. the server was down).
    if (entry && (entry.data === undefined || entry.error)) void load(key);
  }, [key]);
  return data as T | undefined;
}

/** First load pending anywhere, and the latest failed request (cleared once it succeeds). */
export function useServerStatus(): ServerStatus {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    () => status,
  );
}

/**
 * Optimistic update: changes the cached value of every key with the prefix right away, so the
 * screen answers a click at once; the refetch after the write then brings the server's truth
 * (and undoes the change if the write failed).
 */
export function patchQueries<T>(prefix: string, update: (data: T, key: string) => T): void {
  for (const [key, entry] of entries) {
    if (!key.startsWith(prefix) || entry.data === undefined) continue;
    entry.data = update(entry.data as T, key);
    listeners.get(key)?.forEach((listener) => listener());
  }
}

/** Refetches every cached key that starts with one of the prefixes ('' = everything). */
export async function invalidate(...prefixes: string[]): Promise<void> {
  const keys = [...entries.keys()].filter((key) => prefixes.some((prefix) => key.startsWith(prefix)));
  await Promise.all(keys.map(load));
}

/** Forgets everything; for tests. */
export function resetStore(): void {
  entries.clear();
  status = { loading: false, error: null };
}
