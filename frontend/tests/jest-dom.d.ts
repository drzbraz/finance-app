import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// jest-dom's matchers on this workspace's vitest (see tests/setup.ts).
declare module 'vitest' {
  interface Assertion<T = any> extends TestingLibraryMatchers<ReturnType<typeof expect.stringContaining>, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<ReturnType<typeof expect.stringContaining>, unknown> {}
}
