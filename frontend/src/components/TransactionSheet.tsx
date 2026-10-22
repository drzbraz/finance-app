import { categorize, extractTags, parseLooseNumber, splitShare, TX_TYPES, TYPE_LABELS, type Transaction, type TxType } from '@finance/shared';
import { useState } from 'react';
import { categoryIcon } from '../categories';
import { useCategories, useRules } from '../hooks';
import { fallbackDescription, MONTH_NAMES } from '../util';
import { useToast } from './layout/Toast';
import RulePrompt from './RulePrompt';
import SplitFields from './SplitFields';
import { Sheet } from './ui';
import { deleteTransaction, restoreTransaction, saveTransaction } from '../api/repo';

/** Edit one transaction. Changes save on "Salvar"; delete offers undo. */
export default function TransactionSheet({ tx, history, onClose }: { tx: Transaction; history: Transaction[]; onClose: () => void }) {
  const rules = useRules();
  const categories = useCategories(rules, history);
  const toast = useToast();
  const [draft, setDraft] = useState(tx);
  // A split entry is edited by what I paid; only my share is stored as the amount.
  const [amountText, setAmountText] = useState(String(tx.split?.total ?? tx.amount).replace('.', ','));
  const [splitPeople, setSplitPeople] = useState<number | null>(tx.split?.people ?? null);
  const [prompt, setPrompt] = useState<{ description: string; category: string } | null>(null);
  const set = (patch: Partial<Transaction>) => setDraft((d) => ({ ...d, ...patch }));
  const splittable = draft.type !== 'income' && draft.type !== 'investment';

  const save = async () => {
    const typed = parseLooseNumber(amountText);
    if (typed === null) return;
    const split = splittable && splitPeople !== null && typed > 0 ? { people: splitPeople, total: typed } : undefined;
    // Saving replaces the whole entry, so `split: undefined` (dropped from the JSON) un-splits it.
    let next: Transaction = {
      ...draft,
      description: draft.description.trim(),
      amount: split ? splitShare(split.total, split.people) : typed,
      tags: [...new Set([...draft.tags, ...extractTags(draft.description)])],
      split,
      ...(split && { paid: true }),
    };
    if (next.categorySource === 'auto' && next.description !== tx.description) next = categorize(next, rules);
    if (!next.description) next = { ...next, description: fallbackDescription(next.type, next.category) };
    await saveTransaction(next);
    toast('Lançamento atualizado', () => restoreTransaction(tx));
    if (next.categorySource === 'manual' && next.category !== tx.category && !next.description.startsWith('(')) setPrompt({ description: next.description, category: next.category });
    else onClose();
  };

  const remove = async () => {
    await deleteTransaction(tx);
    toast(`${tx.description} excluído`, () => restoreTransaction(tx));
    onClose();
  };

  return (
    <Sheet title="Editar lançamento" onClose={onClose}>
      <div className="space-y-4">
        <label className="block">
          <span className="label">{splittable && splitPeople !== null ? 'Valor total pago (€)' : 'Valor (€)'}</span>
          <input className="input num mt-1 text-xl font-semibold" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Descrição</span>
          <input className="input mt-1" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Tipo</span>
            <select className="input mt-1" value={draft.type} onChange={(e) => set({ type: e.target.value as TxType })}>
              {TX_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Categoria</span>
            <select className="input mt-1" value={draft.category} onChange={(e) => set({ category: e.target.value, categorySource: 'manual' })}>
              {[...new Set([...categories, draft.category])].map((c) => <option key={c} value={c}>{categoryIcon(c)} {c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Mês</span>
            <select
              className="input mt-1"
              value={draft.month}
              onChange={(e) => {
                const m = Number(e.target.value);
                set({ month: m, date: `${draft.year}-${String(m).padStart(2, '0')}-${draft.date?.slice(8, 10) ?? '01'}` });
              }}
            >
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Data</span>
            <input
              type="date"
              className="input mt-1"
              value={draft.date ?? ''}
              onChange={(e) => e.target.value && set({ date: e.target.value, month: Number(e.target.value.slice(5, 7)) })}
            />
          </label>
        </div>
        <label className="block">
          <span className="label">Tags</span>
          <input
            className="input mt-1"
            placeholder="#viagem #lisboa"
            value={draft.tags.map((t) => `#${t}`).join(' ')}
            onChange={(e) => set({ tags: [...new Set(e.target.value.split(/[\s,]+/).map((x) => x.replace(/^#/, '').toLowerCase()).filter(Boolean))] })}
          />
        </label>
        {splittable && <SplitFields people={splitPeople} total={parseLooseNumber(amountText)} onChange={setSplitPeople} />}
        {!(splittable && splitPeople !== null) && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={draft.paid} onChange={(e) => set({ paid: e.target.checked })} />
            {draft.type === 'income' ? 'Recebido' : 'Pago'}
          </label>
        )}
        {tx.source && <p className="text-xs text-ink-3">Veio da planilha, célula {tx.source.cell}.</p>}
        <div className="flex justify-between gap-2 pt-2">
          <button className="btn text-bad" onClick={remove}>Excluir</button>
          <div className="flex gap-2">
            <button className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" onClick={save}>Salvar</button>
          </div>
        </div>
      </div>
      {prompt && <RulePrompt key={prompt.description + prompt.category} {...prompt} onClose={() => { setPrompt(null); onClose(); }} />}
    </Sheet>
  );
}
