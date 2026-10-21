import { useMemo, useState } from 'react';
import { deleteTransaction, saveTransaction } from '../db/repo';
import { extractTags } from '../parser/parseWorkbook';
import { useCategories, useRules, useYearTransactions } from '../hooks';
import { categorize } from '../rules/engine';
import { TX_TYPES, TYPE_LABELS, type Transaction, type TxType } from '../types';
import { eur, MONTH_LABELS, newId } from '../util';
import RulePrompt from './RulePrompt';

interface Props {
  year: number;
  month: number;
  /** Optional preset filter, e.g. when opened from a grid cell. */
  only?: Transaction[];
}

export default function TransactionsTable({ year, month, only }: Props) {
  const all = useYearTransactions(year);
  const rules = useRules();
  const categories = useCategories(rules, all);
  const [fMonth, setFMonth] = useState<number | ''>(only ? '' : month);
  const [fType, setFType] = useState<TxType | ''>('');
  const [fCat, setFCat] = useState('');
  const [fTag, setFTag] = useState('');
  const [fPaid, setFPaid] = useState<'' | 'yes' | 'no'>('');
  const [search, setSearch] = useState('');
  const [prompt, setPrompt] = useState<{ description: string; category: string } | null>(null);

  const source = only ? all.filter((t) => only.some((o) => o.id === t.id)) : all;
  const tags = useMemo(() => [...new Set(all.flatMap((t) => t.tags))].sort(), [all]);
  const rows = source
    .filter((t) => fMonth === '' || t.month === fMonth)
    .filter((t) => !fType || t.type === fType)
    .filter((t) => !fCat || t.category === fCat)
    .filter((t) => !fTag || t.tags.includes(fTag))
    .filter((t) => !fPaid || t.paid === (fPaid === 'yes'))
    .filter((t) => !search || t.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.month - b.month || TX_TYPES.indexOf(a.type) - TX_TYPES.indexOf(b.type) || b.amount - a.amount);
  const sum = rows.reduce((a, t) => a + t.amount, 0);

  const update = (t: Transaction, patch: Partial<Transaction>) => saveTransaction({ ...t, ...patch });

  const changeCategory = async (t: Transaction, category: string) => {
    await update(t, { category, categorySource: 'manual' });
    setPrompt({ description: t.description, category });
  };

  const changeDescription = async (t: Transaction, description: string) => {
    if (description === t.description) return;
    const tags = [...new Set([...t.tags, ...extractTags(description)])];
    await saveTransaction(categorize({ ...t, description, tags }, rules));
  };

  const add = async () => {
    const m = fMonth === '' ? month : fMonth;
    const type = fType || 'variable';
    await saveTransaction(
      categorize(
        {
          id: newId(),
          year,
          month: m,
          date: `${year}-${String(m).padStart(2, '0')}-01`,
          description: 'Novo lançamento',
          amount: 0,
          type,
          category: '',
          categorySource: 'auto',
          tags: [],
          paid: type === 'variable' || type === 'additional',
        },
        rules,
      ),
    );
  };

  return (
    <div className="card">
      {!only && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className="input" value={fMonth} onChange={(e) => setFMonth(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todos os meses</option>
            {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className="input" value={fType} onChange={(e) => setFType(e.target.value as TxType | '')}>
            <option value="">Todos os tipos</option>
            {TX_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <select className="input" value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="input" value={fPaid} onChange={(e) => setFPaid(e.target.value as '' | 'yes' | 'no')}>
            <option value="">Pago e pendente</option>
            <option value="yes">Pago</option>
            <option value="no">Pendente</option>
          </select>
          <input className="input" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn-primary ml-auto" onClick={add}>+ Novo</button>
        </div>
      )}
      {!only && tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {tags.map((t) => (
            <button key={t} className={`chip ${fTag === t ? 'bg-emerald-600 text-white' : ''}`} onClick={() => setFTag(fTag === t ? '' : t)}>
              #{t}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="p-1">Pago</th>
              <th className="p-1">Mês</th>
              <th className="p-1">Descrição</th>
              <th className="p-1 text-right">Valor</th>
              <th className="p-1">Tipo</th>
              <th className="p-1">Categoria</th>
              <th className="p-1">Tags</th>
              <th className="p-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className={`border-t border-slate-100 ${t.subgroup ? 'bg-amber-50' : ''}`}>
                <td className="p-1">
                  <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={t.paid} onChange={() => update(t, { paid: !t.paid })} />
                </td>
                <td className="p-1">
                  <select className="input" value={t.month} onChange={(e) => update(t, { month: Number(e.target.value) })}>
                    {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </td>
                <td className="p-1">
                  <input key={t.description} className="input w-full min-w-48" defaultValue={t.description} onBlur={(e) => changeDescription(t, e.target.value.trim())} />
                </td>
                <td className="p-1 text-right">
                  <input
                    key={t.amount}
                    className="input w-24 text-right"
                    inputMode="decimal"
                    defaultValue={t.amount}
                    onBlur={(e) => {
                      const v = Number(e.target.value.replace(',', '.'));
                      if (Number.isFinite(v) && v !== t.amount) update(t, { amount: v });
                    }}
                  />
                </td>
                <td className="p-1">
                  <select className="input" value={t.type} onChange={(e) => update(t, { type: e.target.value as TxType })}>
                    {TX_TYPES.map((x) => <option key={x} value={x}>{TYPE_LABELS[x]}</option>)}
                  </select>
                </td>
                <td className="p-1">
                  <select className="input" value={t.category} onChange={(e) => changeCategory(t, e.target.value)}>
                    {[...new Set([...categories, t.category])].map((c) => <option key={c}>{c}</option>)}
                  </select>
                  {t.categorySource === 'manual' && <span className="ml-1 text-xs text-slate-400" title="Escolhida manualmente">✎</span>}
                </td>
                <td className="p-1">
                  <input
                    key={t.tags.join(' ')}
                    className="input w-32"
                    placeholder="#tag"
                    defaultValue={t.tags.map((x) => `#${x}`).join(' ')}
                    onBlur={(e) => update(t, { tags: [...new Set(e.target.value.split(/[\s,]+/).map((x) => x.replace(/^#/, '').toLowerCase()).filter(Boolean))] })}
                  />
                </td>
                <td className="p-1">
                  <button className="text-slate-400 hover:text-red-600" title="Excluir" onClick={() => deleteTransaction(t)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-300 font-semibold">
              <td colSpan={3} className="p-1">{rows.length} lançamento(s)</td>
              <td className="p-1 text-right tabular-nums">{eur.format(sum)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
      {prompt && <RulePrompt {...prompt} onClose={() => setPrompt(null)} />}
    </div>
  );
}
