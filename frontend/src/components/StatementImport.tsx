import { TX_TYPES, TYPE_DEFAULT_CATEGORY, TYPE_LABELS, type StatementDoubt, type StatementPreview, type StatementRow, type Transaction, type TxType } from '@finance/shared';
import { useEffect, useRef, useState } from 'react';
import { deleteTransactions, previewStatement, saveTransactions } from '../api/repo';
import { categoryIcon } from '../categories';
import { useCategories, useRules } from '../hooks';
import { eur } from '../util';
import { useToast } from './layout/Toast';
import FileDrop from './FileDrop';
import { Modal, Spinner } from './ui';

interface Props {
  /** A PDF dropped on the window, read right away. */
  initialFile?: File | null;
  onClose: () => void;
  /** After recording: the month the statement covers, to show what came in. */
  onImported: (year: number, month: number) => void;
}

/** A line under review: the entry as the user left it, and whether to record it. */
interface Choice {
  row: StatementRow;
  transaction: Transaction;
  selected: boolean;
}

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function doubtText(doubt: StatementDoubt, row: StatementRow): string {
  const m = row.match;
  switch (doubt) {
    case 'duplicate':
      return `Parece já lançado: “${m?.description}” · ${eur.format(m?.amount ?? 0)}${m?.date ? ` · ${shortDate(m.date)}` : ''}`;
    case 'bill':
      return `Débito direto: pode já estar na conta fixa “${m?.description}” (${eur.format(m?.amount ?? 0)})`;
    case 'own-transfer':
      return row.direction === 'debit'
        ? 'Para outra conta sua: investimento ou poupança? Se foi só movimentação, não lance.'
        : 'Veio de outra conta sua: só é receita se for o seu dinheiro do mês.';
    case 'transfer':
      return 'Transferência: aluguel, acerto do Splitwise, presente…? Confira o tipo e a categoria.';
    case 'credit':
      return 'Entrada de dinheiro: salário, reembolso ou alguém te pagando de volta?';
    case 'no-category':
      return 'Não reconheci a categoria: escolha uma.';
    case 'balance':
      return 'O valor não bate com o saldo do extrato: confira no PDF.';
  }
}

/**
 * Bank statement PDF → every line as the entry it would become. Lines the app is sure about
 * come selected; transfers, money in, unknown categories and what looks already recorded wait
 * for the user. Nothing is saved until "Lançar".
 */
export default function StatementImport({ initialFile, onClose, onImported }: Props) {
  const rules = useRules();
  const categories = useCategories(rules, []);
  const toast = useToast();
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handle = async (file: File) => {
    setError('');
    setPreview(null);
    setBusy(true);
    try {
      // Read by the app's own server, on this computer; nothing is saved yet.
      const result = await previewStatement(file);
      setPreview(result);
      setChoices(result.rows.map((row) => ({ row, transaction: row.transaction, selected: !row.alreadyImported && row.doubts.length === 0 })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialFile) handle(initialFile);
  }, [initialFile]);

  const update = (id: string, patch: (c: Choice) => Partial<Choice>) =>
    setChoices((cs) => cs.map((c) => (c.transaction.id === id ? { ...c, ...patch(c) } : c)));
  const setAll = (ids: Set<string>, selected: boolean) => setChoices((cs) => cs.map((c) => (ids.has(c.transaction.id) ? { ...c, selected } : c)));

  const pending = choices.filter((c) => !c.row.alreadyImported);
  const toDecide = pending.filter((c) => c.row.doubts.length > 0);
  const ready = pending.filter((c) => c.row.doubts.length === 0);
  const imported = choices.filter((c) => c.row.alreadyImported);
  const chosen = pending.filter((c) => c.selected);
  const total = chosen.reduce((a, c) => a + (c.transaction.type === 'income' ? 0 : c.transaction.amount), 0);

  const confirm = async () => {
    if (!preview || !chosen.length) return;
    setBusy(true);
    setError('');
    try {
      const entries = chosen.map((c) => c.transaction);
      await saveTransactions(entries);
      toast(`${entries.length} lançamento(s) do extrato`, () => deleteTransactions(entries.map((t) => t.id)));
      onImported(entries[0].year, entries[0].month);
      onClose();
    } catch (e) {
      setError(`Não foi possível lançar: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  return (
    <Modal title="Importar extrato do banco" onClose={onClose} wide>
      {!preview && (
        <FileDrop
          icon="🏦"
          title="Arraste o extrato em PDF aqui ou clique para escolher"
          busyTitle="Lendo extrato…"
          hint="Por enquanto, o “Extrato Combinado” do ActivoBank. O PDF é lido pelo servidor do app, no seu computador, e não fica guardado."
          busy={busy}
          onPick={() => input.current?.click()}
          onFile={handle}
        />
      )}
      <input ref={input} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />

      {error && <p className="mt-3 rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{error}</p>}

      {preview && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-accent-soft p-4">
            <p className="text-lg font-semibold">
              {preview.rows.length} movimentos · {preview.bank}, {shortDate(preview.from)} a {shortDate(preview.to)}/{preview.to.slice(0, 4)}
            </p>
            <p className="mt-1 text-sm text-ink-2">
              {ready.length} prontos para lançar · {toDecide.length} para você decidir
              {imported.length > 0 && ` · ${imported.length} já importados antes`}
            </p>
          </div>

          {toDecide.length > 0 && (
            <Section
              title={`Para você decidir · ${toDecide.length}`}
              hint="Desmarcados: marque o que deve entrar no app."
              choices={toDecide}
              categories={categories}
              onUpdate={update}
              onAll={setAll}
            />
          )}
          {ready.length > 0 && (
            <Section
              title={`Prontos para lançar · ${ready.length}`}
              hint="Categoria reconhecida e nada parecido no app. Desmarque o que não quiser."
              choices={ready}
              categories={categories}
              onUpdate={update}
              onAll={setAll}
            />
          )}
          {imported.length > 0 && (
            <details className="rounded-xl border border-line p-3 text-sm">
              <summary className="cursor-pointer font-medium">Já importados deste extrato · {imported.length}</summary>
              <ul className="mt-2 space-y-0.5 text-ink-2">
                {imported.map((c) => (
                  <li key={c.transaction.id} className="flex justify-between gap-3">
                    <span className="truncate">{shortDate(c.transaction.date!)} · {c.transaction.description}</span>
                    <span className="num">{eur.format(c.transaction.amount)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="sticky -bottom-5 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
            <span className="mr-auto text-sm text-ink-2">
              {chosen.length} selecionado(s){total > 0 && ` · ${eur.format(total)} em saídas`}
            </span>
            <button className="btn" onClick={() => setPreview(null)}>Escolher outro</button>
            <button className="btn-primary" disabled={!chosen.length || busy} onClick={confirm}>
              {busy ? <><Spinner label="Lançando" /> Lançando…</> : `Lançar ${chosen.length}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Section({ title, hint, choices, categories, onUpdate, onAll }: {
  title: string;
  hint: string;
  choices: Choice[];
  categories: string[];
  onUpdate: (id: string, patch: (c: Choice) => Partial<Choice>) => void;
  onAll: (ids: Set<string>, selected: boolean) => void;
}) {
  const ids = new Set(choices.map((c) => c.transaction.id));
  const allOn = choices.every((c) => c.selected);
  return (
    <section aria-label={title}>
      <div className="mb-1.5 flex items-end justify-between gap-2 px-1">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-ink-3">{hint}</p>
        </div>
        <button className="btn-ghost px-2 text-xs" onClick={() => onAll(ids, !allOn)}>{allOn ? 'Desmarcar todos' : 'Marcar todos'}</button>
      </div>
      <ul className="card divide-y divide-line p-0">
        {choices.map((c) => <Line key={c.transaction.id} choice={c} categories={categories} onUpdate={onUpdate} />)}
      </ul>
    </section>
  );
}

function Line({ choice, categories, onUpdate }: { choice: Choice; categories: string[]; onUpdate: (id: string, patch: (c: Choice) => Partial<Choice>) => void }) {
  const { row, transaction: t, selected } = choice;
  const set = (patch: Partial<Transaction>) => onUpdate(t.id, (c) => ({ transaction: { ...c.transaction, ...patch }, selected: true }));
  const changeType = (type: TxType) =>
    set(type === 'income' || type === 'investment' ? { type, category: TYPE_DEFAULT_CATEGORY[type], categorySource: 'auto' } : { type });
  const options = categories.includes(t.category) ? categories : [t.category, ...categories];
  return (
    <li className={`px-4 py-3 ${selected ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex min-w-0 flex-1 items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
            checked={selected}
            onChange={(e) => onUpdate(t.id, () => ({ selected: e.target.checked }))}
            aria-label={`Lançar ${t.description}`}
          />
          <span className="num w-11 shrink-0 text-xs text-ink-3">{shortDate(t.date!)}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{t.description}</span>
            <span className="block truncate text-xs text-ink-3" title={row.raw}>{row.raw}</span>
          </span>
        </label>
        <span className={`num ml-auto text-sm font-semibold ${row.direction === 'credit' ? 'text-good' : ''}`}>
          {row.direction === 'credit' ? '+' : '−'}{eur.format(t.amount)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
        <select className="input w-auto py-1 text-xs" value={t.type} onChange={(e) => changeType(e.target.value as TxType)} aria-label={`Tipo de ${t.description}`}>
          {TX_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
        </select>
        {t.type !== 'income' && t.type !== 'investment' && (
          <select
            className="input w-auto py-1 text-xs"
            value={t.category}
            onChange={(e) => set({ category: e.target.value, categorySource: 'manual' })}
            aria-label={`Categoria de ${t.description}`}
          >
            {options.map((x) => <option key={x} value={x}>{categoryIcon(x)} {x}</option>)}
          </select>
        )}
      </div>
      {row.doubts.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-7 text-xs text-warn">
          {row.doubts.map((d) => <li key={d}>{doubtText(d, row)}</li>)}
        </ul>
      )}
    </li>
  );
}
