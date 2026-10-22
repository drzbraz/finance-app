import { useEffect, useState } from 'react';
import AppShell from './components/layout/AppShell';
import type { PageId } from './components/layout/nav';
import { ToastProvider } from './components/layout/Toast';
import ImportDialog from './components/ImportDialog';
import QuickAdd from './components/QuickAdd';
import { useSettings, useYears, useYearTransactions } from './hooks';
import Bills from './pages/Bills';
import Budgets from './pages/Budgets';
import Compare from './pages/Compare';
import Goals from './pages/Goals';
import Home from './pages/Home';
import SettingsPage from './pages/Settings';
import Transactions from './pages/Transactions';
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
  const [page, setPage] = useState<PageId>('home');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState<{ file: File | null } | null>(null);
  const [dragging, setDragging] = useState(false);
  const history = useYearTransactions(year);

  // Start on the latest imported year when the current one has no data.
  useEffect(() => {
    if (years?.length && !years.includes(year)) setYear(years[years.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years]);

  // "N" opens Quick Add from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e) && !adding && !importing) {
        e.preventDefault();
        setAdding(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adding, importing]);

  // Drop an .xlsx / .json anywhere on the window to import it.
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

  const go = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
  };
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
      {page === 'home' && <Home year={year} month={month} colors={colors} onPage={setPage} onAdd={openAdd} onImport={openImport} />}
      {page === 'transactions' && <Transactions year={year} month={month} onAdd={openAdd} />}
      {page === 'bills' && <Bills year={year} month={month} />}
      {page === 'budgets' && <Budgets year={year} month={month} />}
      {page === 'goals' && <Goals year={year} />}
      {page === 'compare' && <Compare year={year} month={month} colors={colors} />}
      {page === 'settings' && <SettingsPage />}

      {adding && <QuickAdd year={year} month={month} history={history} onClose={() => setAdding(false)} />}
      {importing && (
        <ImportDialog
          initialFile={importing.file}
          onClose={() => setImporting(null)}
          onImported={(y) => {
            setYear(y);
            setPage('home');
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
