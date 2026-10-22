import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// Browser APIs jsdom does not implement, used by the UI (charts, theme, downloads).
if (typeof window !== 'undefined') {
  const { cleanup, configure } = await import('@testing-library/react');
  afterEach(() => cleanup());
  // IndexedDB + live queries can take over a second when the whole suite runs in parallel.
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
  // fake-indexeddb clones with Node's structuredClone, whose ArrayBuffers fail jsdom's
  // `instanceof ArrayBuffer` (JSZip checks it). Copy them into this realm, as a browser would.
  const nodeClone = globalThis.structuredClone;
  const toRealm = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Object.prototype.toString.call(v) === '[object ArrayBuffer]' && !(v instanceof ArrayBuffer)) {
      const copy = new ArrayBuffer((v as ArrayBuffer).byteLength);
      new Uint8Array(copy).set(new Uint8Array(v as ArrayBuffer));
      return copy;
    }
    if (Array.isArray(v)) return v.map(toRealm);
    if (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null) {
      for (const k of Object.keys(v)) (v as Record<string, unknown>)[k] = toRealm((v as Record<string, unknown>)[k]);
    }
    return v;
  };
  globalThis.structuredClone = ((value: unknown, options?: StructuredSerializeOptions) => toRealm(nodeClone(value, options))) as typeof structuredClone;

  URL.createObjectURL ??= () => 'blob:test';
  URL.revokeObjectURL ??= () => {};
}
