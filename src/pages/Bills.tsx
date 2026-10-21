import { useMemo, useState } from 'react';
import { billsForMonth, isoDate, mergeRecurring, startMonthTxs, type Bill, type BillBucket } from '../analytics/bills';
import { categoryIcon } from '../categories';
import { useToast } from '../components/layout/Toast';
import BillSheet from '../components/BillSheet';
import SpendingLimits from '../components/SpendingLimits';
import { EmptyState, PageHeader, PaidCheck, ProgressBar } from '../components/ui';
import { db } from '../db/schema';
import { restoreTransaction, saveRecurring, saveTransaction } from '../db/repo';
import { useRules, useStoredRecurring, useToday, useYearTransactions } from '../hooks';
import { categorize } from '../rules/engine';
import { TYPE_LABELS } from '../types';
import { eur, MONTH_NAMES, newId } from '../util';

const BUCKETS: { id: BillBucket; title: string; empty?: string }[] = [
  { id: 'overdue', title: 'Atrasadas' },
  { id: 'soon', title: 'Próximos 7 dias' },
  { id: 'later', title: 'Mais tarde' },
  { id: 'done', title: 'Pagas e recebidas' },
];

/** Recurring bills and income for the month: one click marks paid (the green cell in the sheet). */
export default function Bills({ year, month }: { year: number; month: number }) {
  const txs = useYearTransactions(year);
  const stored = useStoredRecurring();
  const rules = useRules();
  const today = useToday();
  const toast = useToast();
  // undefined = closed, null = new bill
  const [sheet, setSheet] = useState<Bill | null | undefined>(undefined);

  const recurring = useMemo(() => mergeRecurring(txs, stored, month), [txs, stored, month]);
  const bills = billsForMonth(txs, recurring, year, month, today);
  const toCreate = startMonthTxs(txs, recurring, year, month);
  const done = bills.filter((b) => b.done).length;
  const toPay = bills.filter((b) => !b.done && b.item.type !== 'income').reduce((a, b) => a + b.amount, 0);
  const toReceive = bills.filter((b) => !b.done && b.item.type === 'income').reduce((a, b) => a + b.amount, 0);

  const toggle = async (b: Bill) => {
    if (b.txs.length) {
      const next = !b.done;
      await Promise.all(b.txs.map((t) => saveTransaction({ ...t, paid: next })));
      toast(`${b.item.description}: ${next ? (b.item.type === 'income' ? 'recebido' : 'pago') : 'pendente'}`, () =>
        Promise.all(b.txs.map((t) => restoreTransaction(t))),
      );
      return;
    }
    // Nothing recorded yet: record it with the expected amount, already paid.
    const tx = categorize(
      {
        id: newId(),
        year,
        month,
        date: isoDate(year, month, Math.min(b.item.dueDay ?? 1, 28)),
        description: b.item.description,
        amount: b.amount,
        type: b.item.type,
        category: '',
        categorySource: 'auto',
        tags: [],
        paid: true,
      },
      rules,
    );
    await saveTransaction(tx);
    toast(`${b.item.description} registrado com ${eur.format(b.amount)}`, () => db.transactions.delete(tx.id));
  };

  const startMonth = async () => {
    const created = toCreate.map((t) => categorize(t, rules));
    await Promise.all(created.map((t) => saveTransaction(t)));
    toast(`${created.length} conta(s) de ${MONTH_NAMES[month - 1]} criada(s) como pendentes`, () => db.transactions.bulkDelete(created.map((t) => t.id)));
  };

  const inactive = recurring.filter((r) => !r.active);
  const keys = recurring.map((r) => r.key);
  const openNew = () => setSheet(null);

  return (
    <div>
      <PageHeader
        title="Contas"
        subtitle={
          bills.length
            ? `${MONTH_NAMES[month - 1]} ${year} · ${done} de ${bills.length} feitas · ${eur.format(toPay)} a pagar · ${eur.format(toReceive)} a receber`
            : `${MONTH_NAMES[month - 1]} ${year}`
        }
        actions={
          <>
            {toCreate.length > 0 && (
              <button className="btn" onClick={startMonth} title="Cria as contas que ainda não estão no mês, como pendentes">
                Iniciar {MONTH_NAMES[month - 1].toLowerCase()} ({toCreate.length})
              </button>
            )}
            <button className="btn-primary" onClick={openNew}>+ Nova conta</button>
          </>
        }
      />

      {bills.length > 0 && <div className="mb-5"><ProgressBar value={done / bills.length} label="Contas feitas" /></div>}

      <div className="mb-5">
        <SpendingLimits txs={txs} year={year} month={month} />
      </div>

      {recurring.length === 0 ? (
        <EmptyState
          icon="🗓️"
          title="Nenhuma conta recorrente ainda"
          text="Importe sua planilha (aluguel, salário e assinaturas aparecem sozinhos) ou adicione uma conta."
          action={<button className="btn-primary" onClick={openNew}>+ Nova conta</button>}
        />
      ) : (
        <div className="space-y-4">
          {BUCKETS.map(({ id, title }) => {
            const list = bills.filter((b) => b.bucket === id);
            if (!list.length) return null;
            return (
              <section key={id}>
                <h2 className={`label mb-1.5 px-1 ${id === 'overdue' ? 'text-bad' : ''}`}>{title} · {list.length}</h2>
                <ul className="card divide-y divide-line p-0">
                  {list.map((b) => (
                    <li key={b.item.key} className="flex items-center gap-3 px-4 py-3">
                      <PaidCheck checked={b.done} onChange={() => toggle(b)} label={`${b.item.description} ${b.item.type === 'income' ? 'recebido' : 'pago'}`} />
                      <span className="text-lg" aria-hidden>{categoryIcon(b.txs[0]?.category ?? (b.item.type === 'income' ? 'Receita' : b.item.type === 'investment' ? 'Investimento' : ''))}</span>
                      <button className="min-w-0 flex-1 text-left" onClick={() => setSheet(b)} title="Editar conta">
                        <p className={`truncate text-sm font-medium ${b.done ? 'text-ink-3 line-through' : ''}`}>{b.item.description}</p>
                        <p className={`text-xs ${b.bucket === 'overdue' ? 'text-bad' : 'text-ink-3'}`}>
                          {TYPE_LABELS[b.item.type]}
                          {b.dueDate && ` · vence ${new Date(`${b.dueDate}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`}
                          {!b.recorded && ' · ainda não lançado'}
                        </p>
                      </button>
                      <span className={`num text-sm font-semibold ${b.recorded ? '' : 'text-ink-3'}`} title={b.recorded ? undefined : 'Valor esperado'}>
                        {b.recorded ? '' : '~'}{eur.format(b.amount)}
                      </span>
                      <button className="btn-ghost px-2 text-ink-3" onClick={() => setSheet(b)} aria-label={`Editar ${b.item.description}`}>✎</button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {inactive.length > 0 && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-medium text-ink-2">Inativas · {inactive.length}</summary>
              <ul className="mt-2 divide-y divide-line">
                {inactive.map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="text-ink-3">{r.description} · {TYPE_LABELS[r.type]}</span>
                    <button className="btn" onClick={() => saveRecurring({ ...r, active: true })}>Reativar</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {sheet !== undefined && (
        <BillSheet
          key={sheet?.item.key ?? 'new'}
          bill={sheet}
          year={year}
          month={month}
          txs={txs}
          existingKeys={keys}
          onClose={() => setSheet(undefined)}
        />
      )}
    </div>
  );
}
