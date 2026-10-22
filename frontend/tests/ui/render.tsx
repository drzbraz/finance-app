import type { Budget, RecurringItem, Transaction } from '@finance/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { resetStore } from '../../src/api/store';
import { ToastProvider } from '../../src/components/layout/Toast';
import { tx } from '../helpers';
import { db, fakeFetch, requests, resetServer } from './fakeApi';

// Every request of the app goes to the in-memory backend.
globalThis.fetch = fakeFetch;

/** "Today" for every UI test: Thursday 22 October 2026, midday (local time). */
export const TODAY = new Date(2026, 9, 22, 12, 0, 0);

/** Freezes only Date, so promises, fetch and user-event keep real timers. */
export function freezeToday(date = TODAY) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(date);
}

/** A fresh server (default rules and settings) and an empty client cache, as on a first visit. */
export async function resetDb() {
  resetServer();
  resetStore();
  requests.length = 0;
}

export async function seed(data: { txs?: Partial<Transaction>[]; budgets?: Budget[]; recurring?: RecurringItem[] }) {
  if (data.txs) await db.transactions.bulkPut(data.txs.map((t) => tx(t)));
  if (data.budgets) await db.budgets.bulkPut(data.budgets);
  if (data.recurring) await db.recurring.bulkPut(data.recurring);
}

export function setup(ui: ReactElement) {
  const user = userEvent.setup();
  return { user, ...render(<ToastProvider>{ui}</ToastProvider>) };
}

/** Live (non-deleted) transactions on the server. */
export const liveTxs = () => db.transactions.filter((t) => !t.deleted).toArray();

/** Clicks "Desfazer" on the toast that contains `text`. */
export async function undoToast(user: ReturnType<typeof userEvent.setup>, text: string | RegExp) {
  const toast = (await screen.findByText(text)).parentElement!;
  await user.click(within(toast).getByRole('button', { name: 'Desfazer' }));
}

export { screen, waitFor, within };
