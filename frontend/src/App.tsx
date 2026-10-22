import { useEffect, useState } from 'react';
import AppShell from './components/layout/AppShell';
import type { PageId } from './components/layout/nav';
import { ToastProvider } from './components/layout/Toast';
import ImportDialog from './components/ImportDialog';
import QuickAdd from './components/QuickAdd';
import StatementImport from './components/StatementImport';
import { ApiError } from './api/http';
import { EVERYTHING } from './api/keys';
import { invalidate, useServerStatus } from './api/store';
import { PageSkeleton, Spinner } from './components/ui';
import { useSettings, useYears, useYearTransactions, useYearTransactionsLoading } from './hooks';
import Bills from './pages/Bills';
import Budgets from './pages/Budgets';
import Compare from './pages/Compare';
import Goals from './pages/Goals';
import Home from './pages/Home';
import SettingsPage from './pages/Settings';
import Transactions from './pages/Transactions';
import { useRoute } from './route';
import { chartColors, useTheme } from './theme';

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export default function App() {
  return (
    <ToastProvider>
      <Main />
    </ToastProvider>
  );
}

function Main() {
  const now = new Date();
  const years = useYears();
  const settings = useSettings();
  const theme = useTheme(settings.theme);
  const colors = chartColors(theme);
  const [route, navigate] = useRoute({ page: 'home', year: now.getFullYear(), month: now.getMonth() + 1 });
  const { page, year, month } = route;
  const setPage = (p: PageId) => navigate({ page: p });
  const setYear = (y: number) => navigate({ year: y, ...(route.category && { category: route.category }) });
  const [adding, setAdding] = useState(false);
  // `stay`: importing another year from Comparar keeps you there, on the year you were comparing.
  const [importing, setImporting] = useState<{ file: File | null; stay?: boolean } | null>(null);
  const [statement, setStatement] = useState<{ file: File | null } | null>(null);
  const [dragging, setDragging] = useState(false);
  const history = useYearTransactions(year);
  const status = useServerStatus();
  // The first screen waits for the year's entries behind a skeleton instead of flashing "empty".
  const yearLoaded = useYearTransactionsLoading(year) !== undefined;
  const loaded = years !== undefined && yearLoaded;
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    await invalidate(EVERYTHING);
    setRetrying(false);
  };

  // Start on the latest imported year when the current one has no data.
  useEffect(() => {
    if (years?.length && !years.includes(year)) setYear(years[years.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years]);

  // ⌥N / Alt+N opens Quick Add from anywhere, even while typing; so does ⌘N / Ctrl+N where the
  // browser lets the page have it (most keep it for "new window"). Plain "N" works outside fields.
  // e.code, not e.key: on a Mac ⌥N types "˜".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyN' || e.shiftKey || adding || importing || statement) return;
      const mod = e.altKey || e.metaKey || e.ctrlKey;
      const plain = !e.altKey && !e.metaKey && !e.ctrlKey && !isTyping(e);
      if (mod || plain) {
        e.preventDefault();
        setAdding(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adding, importing, statement]);

  // Drop an .xlsx / .json anywhere on the window to import it; a .pdf is read as a bank statement.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file && /\.(xlsx|json)$/i.test(file.name)) setImporting({ file });
      else if (file && /\.pdf$/i.test(file.name)) setStatement({ file });
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const go = (y: number, m: number) => navigate({ year: y, month: m, ...(route.category && { category: route.category }) });
  const openAdd = () => setAdding(true);
  const openImport = () => setImporting({ file: null });

  return (
    <AppShell
      page={page}
      onPage={setPage}
      year={year}
      month={month}
      years={years ?? []}
      onMonth={go}
      theme={settings.theme}
      onAdd={openAdd}
      onImport={openImport}
    >
      {status.error && (
        <div role="alert" className="animate-in mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-bad/30 bg-bad/5 p-3 text-sm">
          <span className="flex-1">
            <b>{status.error instanceof ApiError && status.error.status > 0 ? 'O servidor não conseguiu carregar os dados.' : 'Não consegui falar com o servidor.'}</b>{' '}
            <span className="text-ink-2">{status.error.message}</span>
          </span>
          <button className="btn" onClick={retry} disabled={retrying}>{retrying ? <Spinner label="Tentando" /> : '↻'} Tentar de novo</button>
        </div>
      )}
      {!loaded ? (
        !status.error && <PageSkeleton />
      ) : (
        <div key={page} className="animate-page">
        {page === 'home' && <Home year={year} month={month} colors={colors} onPage={setPage} onAdd={openAdd} onImport={openImport} onCategory={(category) => navigate({ page: 'transactions', category })} />}
        {page === 'transactions' && <Transactions key={route.category ?? ''} year={year} month={month} initialCategory={route.category} onAdd={openAdd} onImportStatement={() => setStatement({ file: null })} />}
        {page === 'bills' && <Bills year={year} month={month} />}
        {page === 'budgets' && <Budgets year={year} month={month} />}
        {page === 'goals' && <Goals year={year} />}
        {page === 'compare' && <Compare year={year} month={month} colors={colors} onImport={() => setImporting({ file: null, stay: true })} />}
        {page === 'settings' && <SettingsPage />}
        </div>
      )}

      {adding && <QuickAdd year={year} month={month} history={history} onClose={() => setAdding(false)} />}
      {importing && (
        <ImportDialog
          initialFile={importing.file}
          onClose={() => setImporting(null)}
          onImported={(y) => {
            if (importing.stay) return;
            setYear(y);
            setPage('home');
          }}
        />
      )}
      {statement && (
        <StatementImport
          initialFile={statement.file}
          onClose={() => setStatement(null)}
          onImported={(y, m) => {
            go(y, m);
            setPage('transactions');
          }}
        />
      )}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/15 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-accent bg-surface px-10 py-8 text-center shadow-2xl">
            <p className="text-4xl" aria-hidden>📄</p>
            <p className="mt-2 text-lg font-semibold">Solte para importar</p>
            <p className="text-sm text-ink-2">Planilha .xlsx ou backup .json</p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
