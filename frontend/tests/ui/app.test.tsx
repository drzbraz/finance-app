import { act, fireEvent } from '@testing-library/react';
import App from '../../src/App';
import { saveSettings } from '../../src/api/repo';
import { buildStatement } from '../../../backend/src/testing/statement.fixture';
import { buildWorkbook } from '../fixtures/workbook';
import { freezeToday, resetDb, screen, seed, setup, waitFor, within } from './render';

beforeEach(async () => {
  freezeToday();
  await resetDb();
  document.documentElement.classList.remove('dark');
});
afterEach(() => vi.useRealTimers());

const show = () => setup(<App />);
const sidebar = () => screen.getAllByRole('navigation', { name: 'Principal' })[0];
const monthSelect = () => screen.getByRole('combobox', { name: 'Mês' });
const yearSelect = () => screen.getByRole('combobox', { name: 'Ano' });

describe('App shell', () => {
  it('opens on the current month and switches pages from the sidebar', async () => {
    await seed({ txs: [{ month: 10, description: 'cafe', amount: 3, category: 'Restaurante' }] });
    const { user } = show();
    expect(await screen.findByRole('heading', { name: 'Outubro 2026' })).toBeInTheDocument();
    expect(monthSelect()).toHaveValue('10');
    for (const [label, heading] of [['Transações', 'Transações'], ['Contas', 'Contas'], ['Orçamentos', 'Orçamentos'], ['Metas', 'Metas'], ['Configurações', 'Configurações']]) {
      await user.click(within(sidebar()).getByRole('button', { name: new RegExp(label) }));
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
      expect(within(sidebar()).getByRole('button', { name: new RegExp(label) })).toHaveAttribute('aria-current', 'page');
    }
  });

  it('jumps to the latest imported year when the current one is empty', async () => {
    await seed({ txs: [{ year: 2025, month: 3, amount: 10 }] });
    show();
    await waitFor(() => expect(yearSelect()).toHaveValue('2025'));
  });

  it('the month arrows roll over the year', async () => {
    const { user } = show();
    await screen.findByText('Nada em 2026 ainda');
    await user.selectOptions(monthSelect(), '12');
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(monthSelect()).toHaveValue('1');
    expect(yearSelect()).toHaveValue('2027');
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(monthSelect()).toHaveValue('12');
    expect(yearSelect()).toHaveValue('2026');
  });

  it('"N" opens Novo lançamento, but not while typing in a field', async () => {
    const { user } = show();
    await screen.findByText('Nada em 2026 ainda');
    await user.click(within(sidebar()).getByRole('button', { name: /Transações/ }));
    await user.type(await screen.findByPlaceholderText(/Buscar/), 'n');
    expect(screen.queryByRole('dialog', { name: 'Novo lançamento' })).not.toBeInTheDocument();
    await user.click(document.body);
    await user.keyboard('n');
    expect(await screen.findByRole('dialog', { name: 'Novo lançamento' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('⌥N / Alt+N opens Novo lançamento from anywhere, even while typing; so does ⌘N when the browser allows', async () => {
    const { user } = show();
    await screen.findByText('Nada em 2026 ainda');
    await user.click(within(sidebar()).getByRole('button', { name: /Transações/ }));
    await user.click(await screen.findByPlaceholderText(/Buscar/));
    fireEvent.keyDown(window, { key: '˜', code: 'KeyN', altKey: true });
    expect(await screen.findByRole('dialog', { name: 'Novo lançamento' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    fireEvent.keyDown(window, { key: 'n', code: 'KeyN', metaKey: true });
    expect(await screen.findByRole('dialog', { name: 'Novo lançamento' })).toBeInTheDocument();
  });

  it('Importar and Exportar are in the top bar only on Configurações', async () => {
    const { user } = show();
    await screen.findByText('Nada em 2026 ainda');
    const topbar = () => within(screen.getByRole('banner'));
    expect(topbar().queryByRole('button', { name: 'Importar' })).not.toBeInTheDocument();
    expect(topbar().queryByRole('button', { name: /Exportar/ })).not.toBeInTheDocument();
    await user.click(within(sidebar()).getByRole('button', { name: /Configurações/ }));
    expect(topbar().getByRole('button', { name: 'Importar' })).toBeInTheDocument();
    expect(topbar().getAllByRole('button', { name: /Exportar|⬇︎/ }).length).toBeGreaterThan(0);
  });

  it('importing another year from Comparar stays on Comparar, on the year being compared', async () => {
    await seed({ txs: [{ month: 1, amount: 10 }] });
    const { user } = show();
    await user.click(within(sidebar()).getByRole('button', { name: /Comparar/ }));
    await user.click(await screen.findByRole('button', { name: /Importar outro ano/ }));
    await user.upload(document.querySelector<HTMLInputElement>('input[type=file]')!, new File([await buildWorkbook()], 'Controle financeiro 2025.xlsx'));
    await user.click(await screen.findByRole('button', { name: 'Importar 2025' }));
    expect(await screen.findByRole('heading', { name: '2025 vs 2026' })).toBeInTheDocument();
    expect(yearSelect()).toHaveValue('2026');
  });

  it('a new entry shows up on Início right after saving', async () => {
    const { user } = show();
    await screen.findByText('Nada em 2026 ainda');
    // The sidebar button (the empty state has one too).
    await user.click(within(screen.getByRole('complementary')).getByRole('button', { name: '+ Novo lançamento' }));
    await user.type(screen.getByPlaceholderText('0,00'), '42 jantar');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Outubro 2026' })).toBeInTheDocument();
    expect((await screen.findAllByText('jantar')).length).toBeGreaterThan(0);
  });

  it('dropping an .xlsx anywhere opens the import with the file already read', async () => {
    show();
    await screen.findByText('Nada em 2026 ainda');
    const file = new File([await buildWorkbook()], 'Controle financeiro 2026.xlsx');
    const dataTransfer = { types: ['Files'], files: [file] };
    act(() => {
      fireEvent(window, Object.assign(new Event('dragenter'), { dataTransfer }));
    });
    expect(screen.getByText('Solte para importar')).toBeInTheDocument();
    act(() => {
      fireEvent(window, Object.assign(new Event('drop', { cancelable: true }), { dataTransfer }));
    });
    expect(screen.queryByText('Solte para importar')).not.toBeInTheDocument();
    expect(await screen.findByText(/Encontramos \d+ lançamentos de 2026/)).toBeInTheDocument();
  });

  it('Transações imports a bank statement PDF and then shows the month it covers', async () => {
    const { user } = show();
    await user.click(within(sidebar()).getByRole('button', { name: /Transações/ }));
    await user.click(await screen.findByRole('button', { name: /Importar extrato PDF/ }));
    const dialog = screen.getByRole('dialog', { name: 'Importar extrato do banco' });
    await user.upload(dialog.querySelector('input[type=file]') as HTMLInputElement, new File([await buildStatement()], 'extrato.pdf'));
    // Nothing in the app yet, so the Gracie Barra debit is not a duplicate: 4 ready.
    await user.click(await screen.findByRole('button', { name: 'Lançar 4' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(monthSelect()).toHaveValue('9');
    expect(await screen.findByText('Continente Bag')).toBeInTheDocument();
  });

  it('a PDF dropped anywhere opens the bank statement import', async () => {
    show();
    await screen.findByText('Nada em 2026 ainda');
    const dataTransfer = { types: ['Files'], files: [new File([await buildStatement()], 'extrato.pdf')] };
    act(() => {
      fireEvent(window, Object.assign(new Event('drop', { cancelable: true }), { dataTransfer }));
    });
    expect(await screen.findByText(/9 movimentos · ActivoBank/)).toBeInTheDocument();
  });

  it('ignores dropped files that are not .xlsx, .json or .pdf', async () => {
    show();
    await screen.findByText('Nada em 2026 ainda');
    const dataTransfer = { types: ['Files'], files: [new File(['x'], 'photo.png')] };
    act(() => {
      fireEvent(window, Object.assign(new Event('drop', { cancelable: true }), { dataTransfer }));
    });
    expect(screen.queryByRole('dialog', { name: 'Importar' })).not.toBeInTheDocument();
  });

  it('applies the dark theme from the settings', async () => {
    await saveSettings({ theme: 'dark' });
    show();
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });

  it('says the data stays on this computer', async () => {
    show();
    expect(await screen.findByText(/Seus dados ficam só no seu computador/)).toBeInTheDocument();
  });
});
