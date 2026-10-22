import { categorize, newId, TYPE_LABELS } from '@finance/shared';
import { useMemo, useState } from 'react';
import { billsForMonth, isoDate, mergeRecurring, startedMonthTxs, startMonthTxs, type Bill, type BillBucket } from '../analytics/bills';
import { categoryIcon } from '../categories';
import { useToast } from '../components/layout/Toast';
import BillSheet from '../components/BillSheet';
import SpendingLimits from '../components/SpendingLimits';
import { EmptyState, PageHeader, PaidCheck, ProgressBar } from '../components/ui';
import { useRules, useStoredRecurring, useToday, useYearTransactions } from '../hooks';
import { eur, MONTH_NAMES } from '../util';
import { deleteTransactions, restoreTransaction, saveRecurring, saveTransaction, saveTransactions } from '../api/repo';

const BUCKETS: { id: BillBucket; title: string; hint?: string }[] = [
  { id: 'overdue', title: 'Atrasadas' },
  { id: 'soon', title: 'Próximos 7 dias' },
  { id: 'later', title: 'Mais tarde' },
  { id: 'optional', title: 'Opcionais', hint: 'Só contam no mês se você lançar.' },
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
  const [confirmUndo, setConfirmUndo] = useState(false);

  const recurring = useMemo(() => mergeRecurring(txs, stored, month), [txs, stored, month]);
  const bills = billsForMonth(txs, recurring, year, month, today);
  const toCreate = startMonthTxs(txs, recurring, year, month);
  const started = startedMonthTxs(txs, recurring, year, month);
  // Optional lines not recorded this month stay out of the totals and the progress.
  const counted = bills.filter((b) => b.bucket !== 'optional');
  const done = counted.filter((b) => b.done).length;
  const toPay = counted.filter((b) => !b.done && b.item.type !== 'income').reduce((a, b) => a + b.amount, 0);
  const toReceive = counted.filter((b) => !b.done && b.item.type === 'income').reduce((a, b) => a + b.amount, 0);

  const toggle = async (b: Bill) => {
    if (b.txs.length) {
      const next = !b.done;
      await saveTransactions(b.txs.map((t) => ({ ...t, paid: next })));
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
    toast(`${b.item.description} registrado com ${eur.format(b.amount)}`, () => deleteTransactions([tx.id]));
  };

  const startMonth = async () => {
    const created = toCreate.map((t) => categorize(t, rules));
    await saveTransactions(created);
    toast(`${created.length} conta(s) de ${MONTH_NAMES[month - 1]} criada(s) como pendentes`, () => deleteTransactions(created.map((t) => t.id)));
  };

  const undoStart = async () => {
    const removed = started;
    // After an export these have a sheet cell: soft-delete so the next export clears it.
    await deleteTransactions(removed.map((t) => t.id));
    setConfirmUndo(false);
    toast(`Início de ${MONTH_NAMES[month - 1].toLowerCase()} desfeito: ${removed.length} lançamento(s) pendente(s) removido(s)`, () =>
      Promise.all(removed.map((t) => restoreTransaction(t))),
    );
  };

  const inactive = recurring.filter((r) => !r.active);
  const keys = recurring.map((r) => r.key);
  const openNew = () => setSheet(null);

  return (
    <div>
      <PageHeader
        title="Contas"
        subtitle={
          counted.length
            ? `${MONTH_NAMES[month - 1]} ${year} · ${done} de ${counted.length} feitas · ${eur.format(toPay)} a pagar · ${eur.format(toReceive)} a receber`
            : `${MONTH_NAMES[month - 1]} ${year}`
        }
        actions={
          <>
            {started.length > 0 && (
              <button className="btn" onClick={() => setConfirmUndo(true)} title="Remove os lançamentos pendentes criados pelo “Iniciar mês”">
                ↺ Desfazer início de {MONTH_NAMES[month - 1].toLowerCase()}
              </button>
            )}
            {toCreate.length > 0 && (
              <button className="btn" onClick={startMonth} title="Cria as contas que ainda não estão no mês, como pendentes">
                Iniciar {MONTH_NAMES[month - 1].toLowerCase()} ({toCreate.length})
              </button>
            )}
            <button className="btn-primary" onClick={openNew}>+ Nova conta</button>
          </>
        }
      />

      {confirmUndo && started.length > 0 && (
        <div className="mb-5 space-y-3 rounded-2xl border border-warn/40 bg-warn/5 p-4 text-sm">
          <p className="font-semibold">Desfazer o início de {MONTH_NAMES[month - 1].toLowerCase()}?</p>
          <p className="text-ink-2">
            Estes {started.length} lançamento(s) pendente(s) criados pelo “Iniciar mês” serão removidos. Os que você já marcou como
            pagos ficam.
          </p>
          <ul className="num max-h-48 overflow-y-auto rounded-xl bg-surface p-2 text-xs">
            {started.map((t) => (
              <li key={t.id} className="flex justify-between gap-2 px-1 py-0.5">
                <span>{t.description}</span>
                <span>{eur.format(t.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setConfirmUndo(false)}>Cancelar</button>
            <button className="btn-primary" onClick={undoStart}>Desfazer início</button>
          </div>
        </div>
      )}

      {counted.length > 0 && <div className="mb-5"><ProgressBar value={done / counted.length} label="Contas feitas" /></div>}

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
          {BUCKETS.map(({ id, title, hint }) => {
            const list = bills.filter((b) => b.bucket === id);
            if (!list.length) return null;
            return (
              <section key={id}>
                <h2 className={`label mb-1.5 px-1 ${id === 'overdue' ? 'text-bad' : ''}`}>
                  {title} · {list.length}
                  {hint && <span className="ml-2 font-normal normal-case tracking-normal text-ink-3">{hint}</span>}
                </h2>
                <ul className="card divide-y divide-line p-0">
                  {list.map((b) => (
                    <li key={b.item.key} className="flex items-center gap-3 px-4 py-3">
                      {b.bucket === 'optional' ? (
                        <span className="h-6 w-6 shrink-0" aria-hidden />
                      ) : (
                        <PaidCheck checked={b.done} onChange={() => toggle(b)} label={`${b.item.description} ${b.item.type === 'income' ? 'recebido' : 'pago'}`} />
                      )}
                      <span className="text-lg" aria-hidden>{categoryIcon(b.txs[0]?.category ?? (b.item.type === 'income' ? 'Receita' : b.item.type === 'investment' ? 'Investimento' : ''))}</span>
                      <button className="min-w-0 flex-1 text-left" onClick={() => setSheet(b)} title="Editar conta">
                        <p className={`truncate text-sm font-medium ${b.done ? 'text-ink-3 line-through' : ''}`}>{b.item.description}</p>
                        <p className={`text-xs ${b.bucket === 'overdue' ? 'text-bad' : 'text-ink-3'}`}>
                          {TYPE_LABELS[b.item.type]}
                          {b.dueDate && ` · vence ${new Date(`${b.dueDate}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`}
                          {!b.recorded && (b.bucket === 'optional' ? ' · não lançado este mês' : ' · ainda não lançado')}
                        </p>
                      </button>
                      <span className={`num text-sm font-semibold ${b.recorded ? '' : 'text-ink-3'}`} title={b.recorded ? undefined : 'Valor esperado'}>
                        {b.recorded ? '' : '~'}{eur.format(b.amount)}
                      </span>
                      {b.bucket === 'optional' && (
                        <button className="btn px-3 py-1 text-xs" onClick={() => toggle(b)} title="Lança com o valor esperado; mude o valor no ✎">Lançar</button>
                      )}
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
