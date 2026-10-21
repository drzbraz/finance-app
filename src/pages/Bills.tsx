import { useMemo, useState } from 'react';
import { billsForMonth, isoDate, mergeRecurring, startMonthTxs, type Bill, type BillBucket } from '../analytics/bills';
import { categoryIcon } from '../categories';
import { useToast } from '../components/layout/Toast';
import { EmptyState, PageHeader, PaidCheck, ProgressBar } from '../components/ui';
import { db } from '../db/schema';
import { restoreTransaction, saveRecurring, saveTransaction } from '../db/repo';
import { useRules, useStoredRecurring, useToday, useYearTransactions } from '../hooks';
import { categorize } from '../rules/engine';
import { TYPE_LABELS, type RecurringItem } from '../types';
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
  const [editing, setEditing] = useState(false);

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

  const update = (item: RecurringItem, patch: Partial<RecurringItem>) => saveRecurring({ ...item, ...patch });

  if (recurring.length === 0) {
    return <EmptyState icon="🗓️" title="Nenhuma conta recorrente ainda" text="Importe sua planilha: aluguel, salário, assinaturas e outras linhas fixas aparecem aqui automaticamente." />;
  }

  return (
    <div>
      <PageHeader
        title="Contas"
        subtitle={`${MONTH_NAMES[month - 1]} ${year} · ${done} de ${bills.length} feitas · ${eur.format(toPay)} a pagar · ${eur.format(toReceive)} a receber`}
        actions={
          <>
            {toCreate.length > 0 && (
              <button className="btn-primary" onClick={startMonth} title="Cria as contas que ainda não estão no mês, como pendentes">
                Iniciar {MONTH_NAMES[month - 1].toLowerCase()} ({toCreate.length})
              </button>
            )}
            <button className={`btn ${editing ? 'chip-on' : ''}`} onClick={() => setEditing(!editing)}>
              {editing ? 'Concluir' : 'Vencimentos e valores'}
            </button>
          </>
        }
      />
      <div className="mb-5"><ProgressBar value={bills.length ? done / bills.length : 0} label="Contas feitas" /></div>

      {editing ? (
        <section className="card">
          <p className="mb-3 text-sm text-ink-2">Defina o dia de vencimento e o valor esperado. Desative o que não se repete mais.</p>
          <ul className="divide-y divide-line">
            {recurring.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-3 py-2.5">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" checked={r.active} onChange={(e) => update(r, { active: e.target.checked })} />
                  <span className={r.active ? '' : 'text-ink-3 line-through'}>{r.description}</span>
                  <span className="text-xs text-ink-3">{TYPE_LABELS[r.type]}</span>
                </label>
                <label className="flex items-center gap-1 text-xs text-ink-2">
                  Dia
                  <input
                    key={`d${r.key}${r.dueDay}`}
                    type="number"
                    min={1}
                    max={31}
                    className="input w-16 py-1"
                    defaultValue={r.dueDay ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value ? Math.min(31, Math.max(1, Number(e.target.value))) : undefined;
                      if (v !== r.dueDay) update(r, { dueDay: v });
                    }}
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-ink-2">
                  €
                  <input
                    key={`a${r.key}${r.expectedAmount}`}
                    inputMode="decimal"
                    className="input num w-24 py-1 text-right"
                    defaultValue={r.expectedAmount ?? ''}
                    onBlur={(e) => {
                      const v = Number(e.target.value.replace(',', '.'));
                      if (e.target.value && Number.isFinite(v) && v !== r.expectedAmount) update(r, { expectedAmount: v });
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>
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
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${b.done ? 'text-ink-3 line-through' : ''}`}>{b.item.description}</p>
                        <p className={`text-xs ${b.bucket === 'overdue' ? 'text-bad' : 'text-ink-3'}`}>
                          {TYPE_LABELS[b.item.type]}
                          {b.dueDate && ` · vence ${new Date(`${b.dueDate}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`}
                          {!b.recorded && ' · ainda não lançado'}
                        </p>
                      </div>
                      <span className={`num text-sm font-semibold ${b.recorded ? '' : 'text-ink-3'}`} title={b.recorded ? undefined : 'Valor esperado'}>
                        {b.recorded ? '' : '~'}{eur.format(b.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
