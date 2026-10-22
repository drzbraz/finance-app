import type { Transaction } from '@finance/shared';
import { round2 } from '../util';

/** What the others owe me for a split entry: what I paid minus my share. */
export const receivable = (t: Transaction): number => (t.split ? round2(Math.max(0, t.split.total - t.amount)) : 0);

/** Split entries the others have not paid back yet, oldest first. */
export function pendingReceivables(txs: Transaction[]): Transaction[] {
  return txs
    .filter((t) => t.split && !t.split.receivedOn && receivable(t) > 0)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.month - b.month);
}

/** Total still to receive, optionally for one month only. */
export function receivableTotal(txs: Transaction[], month?: number): number {
  return round2(pendingReceivables(txs).filter((t) => month === undefined || t.month === month).reduce((a, t) => a + receivable(t), 0));
}

/** The entry with the money marked as received today (or back to pending when `on` is null). */
export function markReceived(t: Transaction, on: string | null): Transaction {
  if (!t.split) return t;
  const { receivedOn: _previous, ...split } = t.split;
  return { ...t, split: on ? { ...split, receivedOn: on } : split };
}
