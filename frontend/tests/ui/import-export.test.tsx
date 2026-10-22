import ExportMenu from '../../src/components/ExportMenu';
import ImportDialog from '../../src/components/ImportDialog';
import { saveTransaction } from '../../src/api/repo';
import { db } from './fakeApi';
import { parseWorkbook } from '../../../backend/src/spreadsheets/domain/parser/parse-workbook';
import { buildWorkbook, loadSheet } from '../fixtures/workbook';
import { TODAY, freezeToday, liveTxs, resetDb, screen, setup, waitFor } from './render';

vi.mock('../../src/download', async (orig) => ({ ...(await orig<typeof import('../../src/download')>()), downloadBlob: vi.fn() }));
const { downloadBlob } = await import('../../src/download');

const FILE = 'Controle financeiro 2026.xlsx';
const xlsxFile = async (name = FILE, opts = {}) => new File([await buildWorkbook(opts)], name);
const fileInput = () => document.querySelector<HTMLInputElement>('input[type=file]')!;

beforeEach(async () => {
  freezeToday();
  await resetDb();
  vi.mocked(downloadBlob).mockClear();
});
afterEach(() => vi.useRealTimers());

describe('Importar', () => {
  const show = (initialFile: File | null = null) => {
    const onImported = vi.fn();
    const onClose = vi.fn();
    return { onImported, onClose, ...setup(<ImportDialog initialFile={initialFile} onClose={onClose} onImported={onImported} />) };
  };

  it('reads the sheet, summarizes it in plain words and imports with one click', async () => {
    const expected = (await parseWorkbook(Buffer.from(await buildWorkbook()), { fileName: FILE })).transactions.length;
    const { user, onImported, onClose } = show();
    await user.upload(fileInput(), await xlsxFile());
    expect(await screen.findByText(`Encontramos ${expected} lançamentos de 2026`)).toBeInTheDocument();
    expect(screen.getByText('lido do nome do arquivo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Importar 2026' }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(2026));
    expect(onClose).toHaveBeenCalled();
    expect(await liveTxs()).toHaveLength(expected);
    expect(await db.workbooks.get(2026)).toMatchObject({ fileName: FILE });
    // The sheet's config block reaches the settings and the Patrimônio goal.
    expect((await db.settings.get('settings'))?.eurBrlRate).toBe(6.2);
    expect((await db.goals.get('goal-patrimonio'))?.target).toBe(100000);
  });

  it('re-importing a year says it replaces it and keeps entries created in the app', async () => {
    const first = show();
    await first.user.upload(fileInput(), await xlsxFile());
    await first.user.click(await screen.findByRole('button', { name: 'Importar 2026' }));
    await waitFor(() => expect(first.onImported).toHaveBeenCalled());
    first.unmount();
    await saveTransaction({ id: 'mine', year: 2026, month: 5, description: 'cafe', amount: 3, type: 'variable', category: 'Restaurante', categorySource: 'auto', tags: [], paid: true });

    const again = show();
    await again.user.upload(fileInput(), await xlsxFile());
    expect(await screen.findByText(/Você já tem 2026 no app/)).toHaveTextContent('1 lançamento(s) criado(s) no app continuam');
    await again.user.click(screen.getByRole('button', { name: 'Substituir 2026' }));
    await waitFor(() => expect(again.onImported).toHaveBeenCalled());
    expect(await db.transactions.get('mine')).toBeDefined();
  });

  it('asks for the year when neither A1 nor the file name has one', async () => {
    const { user, onImported } = show();
    await user.upload(fileInput(), await xlsxFile('planilha.xlsx'));
    const year = await screen.findByRole('spinbutton');
    expect(screen.getByRole('button', { name: /^Importar/ })).toBeDisabled();
    await user.type(year, '2024');
    expect(year).toHaveValue(2024);
    await user.click(await screen.findByRole('button', { name: 'Importar 2024' }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(2024));
    expect((await liveTxs()).every((t) => t.year === 2024 && t.id.startsWith('imp-2024-'))).toBe(true);
  });

  it('a file dropped on the window is read right away', async () => {
    show(await xlsxFile());
    expect(await screen.findByText(/Encontramos \d+ lançamentos de 2026/)).toBeInTheDocument();
  });

  it('shows an error for a file that is not a spreadsheet', async () => {
    const { user } = show();
    await user.upload(fileInput(), new File(['not a zip'], 'x.xlsx'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await liveTxs()).toHaveLength(0);
  });

  it('a .json that is not a Finanças backup is refused', async () => {
    const { user } = show();
    await user.upload(fileInput(), new File(['{"hello":1}'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este .json não é um backup do Finanças.');
  });

  it('a backup .json asks before replacing everything', async () => {
    const backup = { app: 'finance-app', version: 2, exportedAt: '2026-10-01T10:00:00Z', transactions: [{}, {}], rules: [], settings: {}, workbooks: [] };
    const { user } = show();
    await user.upload(fileInput(), new File([JSON.stringify(backup)], 'b.json', { type: 'application/json' }));
    expect(await screen.findByText(/Ele tem 2 lançamentos/)).toBeInTheDocument();
    expect(screen.getByText('Isto substitui todos os dados do app.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText(/Arraste a planilha aqui/)).toBeInTheDocument();
  });
});

describe('Exportar', () => {
  async function importYear() {
    const { user, unmount } = setup(<ImportDialog initialFile={await xlsxFile()} onClose={() => {}} onImported={() => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Importar 2026' }));
    await waitFor(async () => expect(await db.workbooks.get(2026)).toBeDefined());
    unmount();
  }

  it('counts changes not exported yet, exports the xlsx with them, and clears the badge', async () => {
    await importYear();
    const { user } = setup(<ExportMenu year={2026} />);
    expect(screen.queryByTitle(/não exportada/)).not.toBeInTheDocument();

    vi.setSystemTime(new Date(TODAY.getTime() + 60_000));
    await saveTransaction({ id: 'new', year: 2026, month: 5, description: 'cinema', amount: 9, type: 'variable', category: 'Lazer', categorySource: 'auto', tags: [], paid: true });
    expect(await screen.findByTitle('1 alteração(ões) não exportada(s)')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: /Exportar/ }));
    expect(screen.getByText('1 alteração(ões) em 2026 ainda não estão na planilha.')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Planilha 2026/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
    const [data, name, mime] = vi.mocked(downloadBlob).mock.calls[0];
    expect(name).toMatch(/\.xlsx$/);
    expect(mime).toContain('spreadsheetml');

    // The new entry is in the file, as a comment in May's column…
    const ws = await loadSheet(data as Blob);
    const cells: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => { if (c.value === 9) cells.push(c.address); }));
    expect(cells.length).toBe(1);
    expect(cells[0]).toMatch(/^F/);
    // …the app now points to that cell, and nothing is pending.
    expect(await db.transactions.get(`imp-2026-${cells[0]}`)).toMatchObject({ description: 'cinema' });
    expect(await db.transactions.get('new')).toBeUndefined();
    await waitFor(() => expect(screen.queryByTitle(/não exportada/)).not.toBeInTheDocument());
    expect(await screen.findByText('Planilha exportada')).toBeInTheDocument();
  });

  it('saves a JSON backup with everything', async () => {
    await importYear();
    const { user } = setup(<ExportMenu year={2026} />);
    await user.click(screen.getByRole('button', { name: /Exportar/ }));
    await user.click(screen.getByRole('menuitem', { name: /Backup completo/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
    const [data, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(name).toBe('financas-backup-2026-10-22.json');
    const backup = JSON.parse(data as string);
    expect(backup).toMatchObject({ app: 'finance-app', version: 2 });
    expect(backup.transactions.length).toBe((await liveTxs()).length);
    expect(backup.workbooks[0].dataBase64.length).toBeGreaterThan(100);
  });

  it('without an imported sheet, exports only the "Lançamentos" ledger', async () => {
    await saveTransaction({ id: 'x', year: 2026, month: 1, description: 'cafe', amount: 3, type: 'variable', category: 'Restaurante', categorySource: 'auto', tags: [], paid: true });
    const { user } = setup(<ExportMenu year={2026} />);
    await user.click(screen.getByRole('button', { name: /Exportar/ }));
    await user.click(screen.getByRole('menuitem', { name: /Planilha 2026/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
    const ws = await loadSheet(vi.mocked(downloadBlob).mock.calls[0][0] as Blob, 'Lançamentos');
    expect(ws.rowCount).toBe(2);
  });

  it('an export error is shown instead of failing silently', async () => {
    await db.workbooks.put({ year: 2026, fileName: 'broken.xlsx', importedAt: '2026-01-01T00:00:00Z', data: Buffer.alloc(8) });
    const { user } = setup(<ExportMenu year={2026} />);
    await user.click(screen.getByRole('button', { name: /Exportar/ }));
    await user.click(screen.getByRole('menuitem', { name: /Planilha 2026/ }));
    expect(await screen.findByText(/^Erro ao exportar:/)).toBeInTheDocument();
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
