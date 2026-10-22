import type { Mock, Mocked } from 'vitest';
import type { Clock } from '../common/clock.js';
import type { UnitOfWork } from '../database/unit-of-work.js';

/**
 * A stand-in for any class: every method is a vi.fn(), created on first use.
 * `then` stays undefined so the mock is not mistaken for a promise when awaited.
 */
export function mockOf<T extends object>(): Mocked<T> {
  const methods = new Map<PropertyKey, Mock>();
  return new Proxy({} as Mocked<T>, {
    get(_target, property) {
      if (property === 'then') return undefined;
      if (!methods.has(property)) methods.set(property, vi.fn());
      return methods.get(property);
    },
  });
}

/** Runs the work straight away, as a transaction that always commits would. */
export function immediateUnitOfWork(): Mocked<UnitOfWork> {
  return { run: vi.fn((work: () => Promise<unknown>) => work()) } as unknown as Mocked<UnitOfWork>;
}

export const FIXED_NOW = '2026-10-22T09:30:00.000Z';

export function fixedClock(iso = FIXED_NOW): Clock {
  return { now: () => new Date(iso), isoNow: () => iso };
}
