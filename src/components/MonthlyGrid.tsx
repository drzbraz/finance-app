import { useMemo, useState } from 'react';
import { monthlyGrid, saldo, totalsByType, expenseTotals } from '../analytics/aggregate';
import { saveTransaction } from '../db/repo';
import { useYearTransactions } from '../hooks';
import { TX_TYPES, TYPE_LABELS, type Transaction, type TxType } from '../types';
import { eur, MONTH_LABELS, MONTH_NAMES, pct } from '../util';
import TransactionsTable from './TransactionsTable';

const PAID_TRACKED: TxType[] = ['income', 'investment', 'fixed'];

/** The spreadsheet layout (sections × months), computed from transactions. */
export default function MonthlyGrid({ year }: { year: number }) {
  const txs = useYearTransactions(year);
  const totals = useMemo(() => totalsByType(txs), [txs]);
  const bal = saldo(totals);
  const exp = expenseTotals(totals);
  const [open, setOpen] = useState<{ title: string; txs: Transaction[] } | null>(null);

  const money = (v: number) => (v ? eur.format(v) : '');

  const cell = (cellTxs: Transaction[], type: TxType, title: string, m: number) => {
    const amount = cellTxs.reduce((a, t) => a + t.amount, 0);
    const allPaid = cellTxs.length > 0 && cellTxs.every((t) => t.paid);
    const tracked = PAID_TRACKED.includes(type);
    const bg = tracked && allPaid ? 'bg-emerald-100' : cellTxs.some((t) => t.subgroup) ? 'bg-amber-50' : '';
    return (
      <td
        key={m}
        className={`group relative cursor-pointer border border-slate-100 px-1 text-right tabular-nums hover:ring-1 hover:ring-emerald-400 ${bg}`}
        title={cellTxs.map((t) => t.description).join(', ')}
        onClick={() => cellTxs.length && setOpen({ title: `${title} · ${MONTH_NAMES[m]}`, txs: cellTxs })}
      >
        {tracked && cellTxs.length > 0 && (
          <input
            type="checkbox"
            className="absolute left-1 top-1/2 h-3 w-3 -translate-y-1/2 accent-emerald-600 opacity-40 group-hover:opacity-100"
            checked={allPaid}
            onClick={(e) => e.stopPropagation()}
            onChange={() => Promise.all(cellTxs.map((t) => saveTransaction({ ...t, paid: !allPaid })))}
            aria-label="Pago"
          />
        )}
        {money(amount)}
      </td>
    );
  };

  const totalRow = (label: string, values: number[], format = money, cls = 'bg-slate-100 font-semibold') => (
    <tr className={cls}>
      <td className="px-2">{label}</td>
      {values.map((v, i) => <td key={i} className="px-1 text-right tabular-nums">{format(v)}</td>)}
    </tr>
  );

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead>
          <tr className="bg-indigo-900 text-white">
            <th className="px-2 text-left">{year}</th>
            {MONTH_LABELS.map((m) => <th key={m} className="px-1">{m}</th>)}
          </tr>
        </thead>
        {TX_TYPES.map((type) => {
          const rows = monthlyGrid(txs, type);
          const pctRow = totals[type].map((v, i) => (totals.income[i] ? v / totals.income[i] : 0));
          return (
            <tbody key={type}>
              <tr>
                <td colSpan={13} className="px-2 pt-3 font-bold">{TYPE_LABELS[type]}</td>
              </tr>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-2 text-slate-600">{r.label}</td>
                  {r.cells.map((c, m) => cell(c, type, r.label || TYPE_LABELS[type], m))}
                </tr>
              ))}
              {totalRow('Total', totals[type])}
              {type !== 'income' && totalRow('% sobre Receita', pctRow, (v) => (v ? pct.format(v) : ''), 'text-slate-500')}
            </tbody>
          );
        })}
        <tbody>
          <tr><td colSpan={13} className="pt-3" /></tr>
          {totalRow('Despesa Total', exp)}
          {totalRow('Saldo', bal, (v) => eur.format(v), 'bg-indigo-900 font-semibold text-white')}
        </tbody>
      </table>

      {open && (
        <div className="fixed inset-0 z-10 flex justify-end bg-black/30" onClick={() => setOpen(null)}>
          <div className="h-full w-full max-w-3xl overflow-y-auto bg-slate-50 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">{open.title}</h3>
              <button className="btn" onClick={() => setOpen(null)}>Fechar</button>
            </div>
            <TransactionsTable year={year} month={open.txs[0].month} only={open.txs} />
          </div>
        </div>
      )}
    </div>
  );
}
