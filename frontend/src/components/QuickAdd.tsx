import { categorize, extractTags, newId, parseLooseNumber, splitShare, TYPE_LABELS, type Transaction, type TxType } from '@finance/shared';
import { useMemo, useRef, useState } from 'react';
import { categoryIcon } from '../categories';
import { useCategories, useRules } from '../hooks';
import { eur, fallbackDescription } from '../util';
import { useToast } from './layout/Toast';
import SplitFields from './SplitFields';
import { Modal, Segmented } from './ui';
import { saveTransaction, deleteTransaction } from '../api/repo';

const TYPE_OPTIONS: { value: TxType; label: string }[] = [
  { value: 'variable', label: 'Variável' },
  { value: 'fixed', label: 'Fixa' },
  { value: 'additional', label: 'Adicional' },
  { value: 'income', label: 'Receita' },
  { value: 'investment', label: 'Investimento' },
];

interface Props {
  year: number;
  month: number;
  /** All transactions of the year, for autocomplete. */
  history: Transaction[];
  onClose: () => void;
}

function defaultDate(year: number, month: number): string {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() + 1 === month) {
    return `${year}-${String(month).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/**
 * Keyboard-first entry: amount, description (autocompleted from history, category suggested
 * live by the rules), type, date. Enter saves; ⌘/Ctrl+Enter saves and keeps the dialog open.
 * Typing "25 jantar #lisboa" in the description also fills the amount. A Splitwise split keeps
 * only my share: the amount typed is then what I paid for everyone.
 */
export default function QuickAdd({ year, month, history, onClose }: Props) {
  const rules = useRules();
  const categories = useCategories(rules, history);
  const toast = useToast();
  const amountRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);

  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TxType>('variable');
  const [date, setDate] = useState(defaultDate(year, month));
  const [category, setCategory] = useState<string | null>(null); // null = follow suggestion
  const [paid, setPaid] = useState<boolean | null>(null); // null = default for type
  const [splitPeople, setSplitPeople] = useState<number | null>(null); // null = not split
  const [error, setError] = useState('');

  // Latest use of each description, for autocomplete and for prefilling type/category.
  const known = useMemo(() => {
    const m = new Map<string, Transaction>();
    for (const t of [...history].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))) {
      if (t.description && !t.description.startsWith('(')) m.set(t.description.toLowerCase(), t);
    }
    return m;
  }, [history]);

  const typed = parseLooseNumber(amountText);
  const splittable = type !== 'income' && type !== 'investment';
  const split = splittable && splitPeople !== null && typed !== null && typed > 0 ? { people: splitPeople, total: typed } : undefined;
  const amount = split ? splitShare(split.total, split.people) : typed;
  // "#tags" become tags; the description keeps just the words.
  const cleanDescription = description.replace(/#[\p{L}\p{N}_-]+/gu, '').replace(/\s+/g, ' ').trim();
  const draft: Transaction = {
    id: '',
    year: Number(date.slice(0, 4)) || year,
    month: Number(date.slice(5, 7)) || month,
    date,
    description: cleanDescription,
    amount: amount ?? 0,
    type,
    category: '',
    categorySource: 'auto',
    tags: extractTags(description),
    paid: split ? true : paid ?? (type === 'variable' || type === 'additional'),
    ...(split && { split }),
  };
  // Without a description the category falls back to the type's default (e.g. Outros).
  const suggested = categorize(draft, rules).category;
  const effectiveCategory = category ?? suggested;

  const onDescription = (value: string) => {
    // "25 jantar" → amount 25, description "jantar" (only while the amount is empty).
    const m = /^\s*(\d+(?:[.,]\d{1,2})?)\s+(.+)$/.exec(value);
    if (m && !amountText) {
      setAmountText(m[1]);
      value = m[2];
    }
    setDescription(value);
    const prev = known.get(value.trim().toLowerCase());
    if (prev) {
      setType(prev.type);
      if (prev.categorySource === 'manual') setCategory(prev.category);
    }
  };

  const save = async (keepOpen: boolean) => {
    if (amount === null || amount <= 0) {
      setError('Informe um valor maior que zero.');
      amountRef.current?.focus();
      return;
    }
    const tx: Transaction = {
      ...draft,
      id: newId(),
      description: cleanDescription || fallbackDescription(type, effectiveCategory),
      category: effectiveCategory,
      categorySource: category !== null && category !== suggested ? 'manual' : 'auto',
    };
    await saveTransaction(tx);
    toast(`${cleanDescription || effectiveCategory} · ${eur.format(tx.amount)} adicionado`, () => deleteTransaction(tx));
    if (keepOpen) {
      setAmountText('');
      setDescription('');
      setCategory(null);
      setSplitPeople(null);
      setError('');
      amountRef.current?.focus();
    } else onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      save(e.metaKey || e.ctrlKey);
    }
  };

  return (
    <Modal title="Novo lançamento" onClose={onClose}>
      <div className="space-y-4" onKeyDown={onKeyDown}>
        <label className="block">
          <span className="label">{splitPeople !== null && splittable ? 'Valor total pago' : 'Valor'}</span>
          <div className="mt-1 flex items-baseline gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 focus-within:border-accent">
            <span className="text-2xl text-ink-3">€</span>
            <input
              ref={amountRef}
              data-autofocus
              inputMode="decimal"
              placeholder="0,00"
              className="num w-full bg-transparent text-3xl font-semibold outline-none placeholder:text-ink-3"
              value={amountText}
              onChange={(e) => {
                setError('');
                // "25 jantar #lisboa" typed here: keep the number, move the rest to the description.
                const m = /^\s*(\d+(?:[.,]\d{1,2})?)\s+(\S.*)$/.exec(e.target.value);
                if (m) {
                  setAmountText(m[1]);
                  onDescription(m[2]);
                  descriptionRef.current?.focus();
                } else setAmountText(e.target.value);
              }}
              aria-invalid={!!error && (amount === null || amount <= 0)}
            />
          </div>
        </label>

        <label className="block">
          <span className="label">Descrição <span className="font-normal text-ink-3">(opcional)</span></span>
          <input
            ref={descriptionRef}
            className="input mt-1"
            list="quickadd-descriptions"
            placeholder="ex.: jantar com amigos #lisboa"
            value={description}
            onChange={(e) => {
              onDescription(e.target.value);
              setError('');
            }}
          />
          <datalist id="quickadd-descriptions">
            {[...known.values()].slice(-200).map((t) => (
              <option key={t.id} value={t.description}>{`${t.category} · ${eur.format(t.amount)}`}</option>
            ))}
          </datalist>
        </label>

        <div>
          <span className="label">Tipo</span>
          <div className="mt-1">
            <Segmented label="Tipo" value={type} options={TYPE_OPTIONS} onChange={(v) => { setType(v); setPaid(null); }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Categoria</span>
            <select className="input mt-1" value={effectiveCategory} onChange={(e) => setCategory(e.target.value)}>
              {!effectiveCategory && <option value="">—</option>}
              {[...new Set([...categories, effectiveCategory].filter(Boolean))].map((c) => (
                <option key={c} value={c}>{categoryIcon(c)} {c}</option>
              ))}
            </select>
            {category === null && cleanDescription && suggested && <span className="mt-1 block text-xs text-ink-3">Sugerida pela descrição</span>}
          </label>
          <label className="block">
            <span className="label">Data</span>
            <input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        {splittable && <SplitFields people={splitPeople} total={typed} onChange={setSplitPeople} />}

        {!split && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={draft.paid} onChange={(e) => setPaid(e.target.checked)} />
            {type === 'income' ? 'Já recebido' : 'Já pago'}
          </label>
        )}

        {error && <p className="text-sm text-bad" role="alert">{error}</p>}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button className="btn" onClick={() => save(true)} title="⌘/Ctrl + Enter">Salvar e adicionar outro</button>
          <button className="btn-primary" onClick={() => save(false)} title="Enter">
            Salvar {amount ? eur.format(amount) : ''}
          </button>
        </div>
        <p className="hidden text-center text-xs text-ink-3 sm:block">
          Enter salva · ⌘/Ctrl+Enter salva e continua · Esc fecha · {TYPE_LABELS[type]}
        </p>
      </div>
    </Modal>
  );
}
