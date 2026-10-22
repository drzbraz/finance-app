import { act, fireEvent } from '@testing-library/react';
import App from '../../src/App';
import { saveSettings } from '../../src/api/repo';
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

  it('ignores dropped files that are not .xlsx or .json', async () => {
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
