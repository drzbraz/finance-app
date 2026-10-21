import { useEffect, useRef, useState } from 'react';
import { totalsByType } from '../analytics/aggregate';
import { appOnlyCount, hasYear, importBackup, replaceYear, type Backup } from '../db/repo';
import { db } from '../db/schema';
import { parseWorkbook } from '../parser/parseWorkbook';
import { applyRules } from '../rules/engine';
import { TX_TYPES, TYPE_LABELS, type ImportResult } from '../types';
import { eur, MONTH_LABELS, round2 } from '../util';
import { Modal } from './ui';

interface Props {
  /** A file dropped on the window, handled right away. */
  initialFile?: File | null;
  onClose: () => void;
  onImported: (year: number) => void;
}

interface Parsed {
  file: File;
  data: ArrayBuffer;
  result: ImportResult;
  year: number | '';
  existing: boolean;
  appOnly: number;
}

const COUNT_LABELS: Record<string, [string, string]> = {
  income: ['receita', 'receitas'],
  investment: ['investimento', 'investimentos'],
  fixed: ['fixa', 'fixas'],
  variable: ['variável', 'variáveis'],
  additional: ['adicional', 'adicionais'],
};

/** Drop an .xlsx (or a .json backup) → plain-language summary → one button. */
export default function ImportDialog({ initialFile, onClose, onImported }: Props) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [backup, setBackup] = useState<{ file: File; data: Backup } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handle = async (file: File) => {
    setError('');
    setParsed(null);
    setBackup(null);
    setBusy(true);
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const data = JSON.parse(await file.text()) as Backup;
        if (data?.app !== 'finance-app') throw new Error('Este .json não é um backup do Finanças.');
        setBackup({ file, data });
        return;
      }
      const data = await file.arrayBuffer();
      const result = await parseWorkbook(data, { fileName: file.name });
      result.transactions = applyRules(result.transactions, await db.rules.toArray());
      const year = result.year ?? '';
      setParsed({
        file,
        data,
        result,
        year,
        existing: year !== '' && (await hasYear(year)),
        appOnly: year !== '' ? await appOnlyCount(year) : 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialFile) handle(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  const changeYear = async (value: string) => {
    if (!parsed) return;
    const year = value ? Number(value) : '';
    setParsed({ ...parsed, year, existing: year !== '' && (await hasYear(year)), appOnly: year !== '' ? await appOnlyCount(year) : 0 });
  };

  const confirm = async () => {
    if (!parsed || parsed.year === '') return;
    setBusy(true);
    setError('');
    try {
      const y = parsed.year;
      // Re-parse when the year was typed in, so ids and dates use it.
      const result = y === parsed.result.year ? parsed.result : await parseWorkbook(parsed.data, { year: y });
      await replaceYear(y, result.transactions, { fileName: parsed.file.name, importedAt: new Date().toISOString(), data: parsed.data }, result.settings);
      onImported(y);
      onClose();
    } catch (e) {
      setError(`Não foi possível importar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!backup) return;
    setBusy(true);
    try {
      await importBackup(backup.data);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Importar" onClose={onClose} wide>
      {!parsed && !backup && (
        <button
          type="button"
          className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${dragging ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent'}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) handle(f);
          }}
        >
          <span className="text-4xl" aria-hidden>📄</span>
          <span className="font-semibold">{busy ? 'Lendo arquivo…' : 'Arraste a planilha aqui ou clique para escolher'}</span>
          <span className="text-sm text-ink-2">.xlsx exportado do Google Sheets, ou um backup .json do app. O arquivo é lido só neste navegador.</span>
        </button>
      )}
      <input ref={input} type="file" accept=".xlsx,.json" className="hidden" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />

      {error && <p className="mt-3 rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{error}</p>}

      {backup && (
        <div className="space-y-4">
          <p>
            Restaurar o backup <b>{backup.file.name}</b> de {new Date(backup.data.exportedAt).toLocaleString('pt-BR')}?
            Ele tem {backup.data.transactions.length} lançamentos.
          </p>
          <p className="rounded-xl bg-warn/10 p-3 text-sm text-warn">Isto substitui todos os dados deste navegador.</p>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setBackup(null)}>Cancelar</button>
            <button className="btn-primary" disabled={busy} onClick={restore}>Restaurar backup</button>
          </div>
        </div>
      )}

      {parsed && <Summary parsed={parsed} onYear={changeYear} />}
      {parsed && (
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={() => setParsed(null)}>Escolher outro</button>
          <button className="btn-primary" disabled={parsed.year === '' || busy} onClick={confirm}>
            {busy ? 'Importando…' : parsed.existing ? `Substituir ${parsed.year}` : `Importar ${parsed.year}`}
          </button>
        </div>
      )}
    </Modal>
  );
}

function Summary({ parsed, onYear }: { parsed: Parsed; onYear: (v: string) => void }) {
  const { result } = parsed;
  const counts = TX_TYPES.map((t) => ({ t, n: result.transactions.filter((x) => x.type === t).length })).filter((c) => c.n > 0);
  const mine = totalsByType(result.transactions);
  const diffs = TX_TYPES.flatMap((type) =>
    (result.sheetTotals[type] ?? []).map((sheet, i) => ({ type, month: i, sheet, app: mine[type][i], diff: round2(mine[type][i] - sheet) })),
  ).filter((d) => Math.abs(d.diff) >= 0.01);
  const uncategorized = result.transactions.filter((t) => t.category === 'Outros').length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-accent-soft p-4">
        <p className="text-lg font-semibold">
          Encontramos {result.transactions.length} lançamentos{parsed.year !== '' ? ` de ${parsed.year}` : ''}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {counts.map(({ t, n }) => `${n} ${COUNT_LABELS[t][n === 1 ? 0 : 1]}`).join(' · ')}
          {uncategorized > 0 && ` · ${uncategorized} sem categoria`}
        </p>
      </div>

      {result.yearSource !== 'A1' && (
        <label className="flex items-center gap-2 text-sm">
          Ano da planilha:
          <input className="input w-28" type="number" value={parsed.year} onChange={(e) => onYear(e.target.value)} />
          <span className="text-ink-3">{result.yearSource === 'filename' ? 'lido do nome do arquivo' : 'informe o ano'}</span>
        </label>
      )}

      {parsed.existing && (
        <p className="rounded-xl bg-warn/10 p-3 text-sm text-warn">
          Você já tem {parsed.year} no app. Os valores da planilha substituem os atuais; categorias que você escolheu à mão
          são mantidas{parsed.appOnly > 0 ? `, e ${parsed.appOnly} lançamento(s) criado(s) no app continuam` : ''}.
        </p>
      )}

      {(diffs.length > 0 || result.warnings.length > 0) && (
        <details className="rounded-xl border border-line p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Ver detalhes ({result.warnings.length} aviso(s){diffs.length ? `, ${diffs.length} diferença(s) com os Totais da planilha` : ''})
          </summary>
          {diffs.length > 0 && (
            <>
              <p className="mt-2 text-ink-2">
                Normal: o app conta o mercado (bloco amarelo) uma vez só e lê números salvos como texto.
              </p>
              <ul className="mt-1 space-y-0.5">
                {diffs.map((d) => (
                  <li key={`${d.type}-${d.month}`} className="num">
                    {TYPE_LABELS[d.type]} · {MONTH_LABELS[d.month]}: planilha {eur.format(d.sheet)} → app {eur.format(d.app)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-2">
              {result.warnings.map((w, i) => <li key={i}>{w.cell && <b>{w.cell}: </b>}{w.message}</li>)}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}
