import { useMemo } from 'react';
import { monthChecklist, type ChecklistItem } from '../analytics/checklist';
import { saveTransaction } from '../db/repo';
import { useRules, useYearTransactions } from '../hooks';
import { categorize } from '../rules/engine';
import { TYPE_LABELS, type TxType } from '../types';
import { eur, MONTH_NAMES, newId } from '../util';

interface Props {
  year: number;
  month: number;
}

/** One checkbox per recurring item: replaces painting the cell green in the spreadsheet. */
export default function MonthChecklist({ year, month }: Props) {
  const txs = useYearTransactions(year);
  const rules = useRules();
  const list = useMemo(() => monthChecklist(txs, month), [txs, month]);

  const toggle = async (item: ChecklistItem) => {
    if (item.txs.length) {
      const next = !item.done;
      await Promise.all(item.txs.map((t) => saveTransaction({ ...t, paid: next })));
      return;
    }
    // Nothing recorded yet: create it from the expected amount, already ticked.
    const mm = String(month).padStart(2, '0');
    await saveTransaction(
      categorize(
        {
          id: newId(),
          year,
          month,
          date: `${year}-${mm}-01`,
          description: item.description,
          amount: item.expected ?? 0,
          type: item.type,
          category: '',
          categorySource: 'auto',
          tags: [],
          paid: true,
        },
        rules,
      ),
    );
  };

  const setAmount = async (item: ChecklistItem, value: string) => {
    const amount = Number(value.replace(',', '.'));
    if (!Number.isFinite(amount) || item.txs.length !== 1) return;
    await saveTransaction({ ...item.txs[0], amount });
  };

  const total = list.items.length;
  const groups: TxType[] = ['income', 'investment', 'fixed'];

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{MONTH_NAMES[month - 1]} {year}</h2>
          <p className="text-sm text-slate-600">
            <b>{list.doneCount} de {total}</b> feitos · {eur.format(list.toPay)} a pagar · {eur.format(list.toReceive)} a receber
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${total ? (list.doneCount / total) * 100 : 0}%` }} />
        </div>
      </div>

      {total === 0 && <p className="text-sm text-slate-500">Nenhum item recorrente neste ano. Importe a planilha primeiro.</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {groups.map((g) => {
          const items = list.items.filter((i) => i.type === g);
          if (!items.length) return null;
          return (
            <section key={g} className="card">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{TYPE_LABELS[g]}</h3>
              <ul className="divide-y divide-slate-100">
                {items.map((item) => {
                  const amount = item.txs.reduce((a, t) => a + t.amount, 0);
                  return (
                    <li key={item.key} className="flex items-center gap-3 py-2">
                      <input
                        type="checkbox"
                        className="h-5 w-5 cursor-pointer accent-emerald-600"
                        checked={item.done}
                        onChange={() => toggle(item)}
                        aria-label={`${item.description} ${g === 'income' ? 'recebido' : 'pago'}`}
                      />
                      <span className={`flex-1 ${item.done ? 'text-slate-400 line-through' : ''}`}>{item.description}</span>
                      {item.txs.length === 1 ? (
                        <input
                          key={item.txs[0].id + item.txs[0].amount}
                          className="input w-24 text-right"
                          defaultValue={item.txs[0].amount}
                          onBlur={(e) => setAmount(item, e.target.value)}
                          inputMode="decimal"
                        />
                      ) : item.txs.length > 1 ? (
                        <span className="text-sm tabular-nums">{eur.format(amount)}</span>
                      ) : (
                        <span className="text-sm italic text-slate-400" title="Valor do mês anterior">
                          ~{eur.format(item.expected ?? 0)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
