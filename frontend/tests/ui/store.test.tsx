import { act, renderHook, waitFor } from '@testing-library/react';
import { invalidate, resetStore, useQuery } from '../../src/api/store';

/** A fetcher whose responses the test releases one by one. */
function controlled() {
  const pending: ((v: string) => void)[] = [];
  const fetcher = vi.fn(() => new Promise<string>((resolve) => pending.push(resolve)));
  return { fetcher, release: (v: string) => pending.shift()!(v) };
}

describe('query store', () => {
  beforeEach(() => resetStore());

  it('a write during the first load still ends with fresh data', async () => {
    const { fetcher, release } = controlled();
    const { result } = renderHook(() => useQuery('k', fetcher));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    // The write lands while the first GET (which read the old data) is still in flight.
    let done = false;
    const inv = invalidate('k').then(() => (done = true));
    await act(async () => release('old'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(done).toBe(false);
    await act(async () => release('new'));
    await inv;
    expect(result.current).toBe('new');
  });

  it('invalidate refetches by prefix, and "" refetches everything', async () => {
    const a = vi.fn(async () => 1);
    const b = vi.fn(async () => 2);
    renderHook(() => [useQuery('transactions:2026', a), useQuery('rules', b)]);
    await waitFor(() => expect(b).toHaveBeenCalledTimes(1));
    await invalidate('transactions:');
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
    await invalidate('');
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('a failed request is retried when a screen mounts again', async () => {
    let fail = true;
    const fetcher = vi.fn(async () => {
      if (fail) throw new Error('down');
      return 'ok';
    });
    const first = renderHook(() => useQuery('k', fetcher));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBeUndefined();
    first.unmount();
    fail = false;
    const second = renderHook(() => useQuery('k', fetcher));
    await waitFor(() => expect(second.result.current).toBe('ok'));
  });
});
