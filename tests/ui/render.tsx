import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { ToastProvider } from '../../src/components/layout/Toast';
import { ensureSeeded } from '../../src/db/repo';
import { db } from '../../src/db/schema';
import type { Budget, RecurringItem, Transaction } from '../../src/types';
import { tx } from '../helpers';

/** "Today" for every UI test: Thursday 22 October 2026, midday (local time). */
export const TODAY = new Date(2026, 9, 22, 12, 0, 0);

/** Freezes only Date, so promises, IndexedDB and user-event keep real timers. */
export function freezeToday(date = TODAY) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(date);
}

/** Empty database with the default rules and settings, as on a first visit. */
export async function resetDb() {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureSeeded();
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

/** Live (non-deleted) transactions in the database. */
export const liveTxs = () => db.transactions.filter((t) => !t.deleted).toArray();

/** Clicks "Desfazer" on the toast that contains `text`. */
export async function undoToast(user: ReturnType<typeof userEvent.setup>, text: string | RegExp) {
  const toast = (await screen.findByText(text)).parentElement!;
  await user.click(within(toast).getByRole('button', { name: 'Desfazer' }));
}

export { screen, waitFor, within };
