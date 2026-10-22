import { normalize, TX_TYPES, TYPE_LABELS, type Transaction, type TxType } from '@finance/shared';
import { useMemo, useState } from 'react';
import { categoryIcon } from '../categories';
import TransactionSheet from '../components/TransactionSheet';
import { EmptyState, PageHeader } from '../components/ui';
import { useCategories, useRules, useYearTransactions } from '../hooks';
import { eur, MONTH_NAMES } from '../util';

const TYPE_SHORT: Record<TxType, string> = { income: 'Receitas', investment: 'Investimentos', fixed: 'Fixas', variable: 'Variáveis', additional: 'Adicionais' };

export default function Transactions({ year, month, onAdd }: { year: number; month: number; onAdd: () => void }) {
  const txs = useYearTransactions(year);
  const rules = useRules();
  const categories = useCategories(rules, txs);
  const [allMonths, setAllMonths] = useState(false);
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState<TxType[]>([]);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'' | 'paid' | 'pending'>('');
  const [tag, setTag] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);

  const tags = useMemo(() => [...new Set(txs.flatMap((t) => t.tags))].sort(), [txs]);
  const q = normalize(search);
  const rows = txs
    .filter((t) => allMonths || t.month === month)
    .filter((t) => !types.length || types.includes(t.type))
    .filter((t) => !category || t.category === category)
    .filter((t) => !status || t.paid === (status === 'paid'))
    .filter((t) => !tag || t.tags.includes(tag))
    .filter((t) => !q || normalize(`${t.description} ${t.category} ${t.tags.join(' ')}`).includes(q))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.amount - a.amount);

  const groups = new Map<string, Transaction[]>();
  for (const t of rows) {
    const key = t.date ?? `${year}-${String(t.month).padStart(2, '0')}-01`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const income = rows.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const out = rows.filter((t) => t.type !== 'income').reduce((a, t) => a + t.amount, 0);

  const toggleType = (t: TxType) => setTypes((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));
  const filtered = types.length || category || status || tag || q;

  return (
    <div>
      <PageHeader
        title="Transações"
        subtitle={`${allMonths ? year : `${MONTH_NAMES[month - 1]} ${year}`} · ${rows.length} lançamento(s) · entradas ${eur.format(income)} · saídas ${eur.format(out)}`}
        actions={<button className="btn-primary" onClick={onAdd}>+ Novo</button>}
      />

      <div className="card mb-4 space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-0 flex-1" placeholder="🔎 Buscar descrição, categoria ou #tag" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {categories.map((c) => <option key={c} value={c}>{categoryIcon(c)} {c}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={`chip ${allMonths ? 'chip-on' : ''}`} onClick={() => setAllMonths(!allMonths)}>Ano todo</button>
          <span className="mx-1 w-px bg-line" />
          {TX_TYPES.map((t) => (
            <button key={t} className={`chip ${types.includes(t) ? 'chip-on' : ''}`} onClick={() => toggleType(t)}>{TYPE_SHORT[t]}</button>
          ))}
          <span className="mx-1 w-px bg-line" />
          <button className={`chip ${status === 'pending' ? 'chip-on' : ''}`} onClick={() => setStatus(status === 'pending' ? '' : 'pending')}>Pendentes</button>
          <button className={`chip ${status === 'paid' ? 'chip-on' : ''}`} onClick={() => setStatus(status === 'paid' ? '' : 'paid')}>Pagos</button>
          {tags.map((x) => (
            <button key={x} className={`chip ${tag === x ? 'chip-on' : ''}`} onClick={() => setTag(tag === x ? '' : x)}>#{x}</button>
          ))}
          {filtered && <button className="chip" onClick={() => { setTypes([]); setCategory(''); setStatus(''); setTag(''); setSearch(''); }}>Limpar filtros ✕</button>}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="🧾" title={filtered ? 'Nada com esses filtros' : 'Nenhum lançamento neste mês'} action={<button className="btn-primary" onClick={onAdd}>+ Novo lançamento</button>} />
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([date, list]) => (
            <section key={date}>
              <h2 className="label mb-1.5 px-1">
                {new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' })}
              </h2>
              <ul className="card divide-y divide-line p-0">
                {list.map((t) => (
                  <li key={t.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditing(t)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditing(t)}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-lg" aria-hidden>{categoryIcon(t.category)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.description}</p>
                        <p className="truncate text-xs text-ink-3">
                          {t.category} · {TYPE_LABELS[t.type]}
                          {t.tags.map((x) => ` #${x}`).join('')}
                          {t.split && ` · Splitwise ÷${t.split.people} de ${eur.format(t.split.total)}`}
                        </p>
                      </div>
                      <span className={`num text-sm font-semibold ${t.type === 'income' ? 'text-good' : ''}`}>
                        {t.type === 'income' ? '+' : '−'}{eur.format(t.amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && <TransactionSheet key={editing.id} tx={editing} history={txs} onClose={() => setEditing(null)} />}
    </div>
  );
}
