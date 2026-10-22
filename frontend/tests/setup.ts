import * as matchers from '@testing-library/jest-dom/matchers';

// Registered on this workspace's vitest (the root node_modules holds the backend's newer one,
// which '@testing-library/jest-dom/vitest' would pick up instead).
expect.extend(matchers);

// Browser APIs jsdom does not implement, used by the UI (charts, theme, downloads).
if (typeof window !== 'undefined') {
  const { cleanup, configure } = await import('@testing-library/react');
  afterEach(() => cleanup());
  // Requests + cache refreshes can take over a second when the whole suite runs in parallel.
  configure({ asyncUtilTimeout: 3000 });

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  const read = <T,>(blob: Blob, how: 'readAsText' | 'readAsArrayBuffer') =>
    new Promise<T>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as T);
      r.onerror = () => reject(r.error);
      r[how](blob);
    });
  Blob.prototype.text ??= function (this: Blob) { return read<string>(this, 'readAsText'); };
  Blob.prototype.arrayBuffer ??= function (this: Blob) { return read<ArrayBuffer>(this, 'readAsArrayBuffer'); };
  URL.createObjectURL ??= () => 'blob:test';
  URL.revokeObjectURL ??= () => {};
}
