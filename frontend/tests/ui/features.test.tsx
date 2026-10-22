import { act } from '@testing-library/react';
import App from '../../src/App';
import Bills from '../../src/pages/Bills';
import Home from '../../src/pages/Home';
import { chartColors } from '../../src/theme';
import { db, fakeFetch } from './fakeApi';
import { freezeToday, resetDb, screen, seed, setup, undoToast, waitFor, within } from './render';

// Today = Thursday 22/10/2026. September and August set the usual month; October runs hot on Restaurante.
const HISTORY = [8, 9].flatMap((month) => [
  { month, date: `2026-0${month}-10`, description: 'jantar', amount: 60, category: 'Restaurante' },
  { month, date: `2026-0${month}-12`, description: 'super', amount: 200, category: 'Mercado' },
]);
const OCT = [
  { id: 'sal', month: 10, date: '2026-10-01', description: 'Salário', amount: 1600, type: 'income' as const, category: 'Receita' },
  { id: 'pizza', month: 10, date: '2026-10-03', description: 'pizza com amigos', amount: 20, category: 'Restaurante', split: { people: 3, total: 60 } },
  { id: 'sushi', month: 10, date: '2026-10-08', description: 'sushi', amount: 90, category: 'Restaurante' },
  { id: 'bar', month: 10, date: '2026-10-08', description: 'bar', amount: 25, category: 'Restaurante' },
  { id: 'merc', month: 10, date: '2026-10-15', description: 'super', amount: 120, category: 'Mercado' },
  { id: 'cine', month: 10, date: '2026-10-17', description: 'cinema', amount: 18, category: 'Lazer', split: { people: 2, total: 36, receivedOn: '2026-10-18' } },
];

beforeEach(async () => {
  freezeToday();
  await resetDb();
  await seed({ txs: [...HISTORY, ...OCT] });
});
afterEach(() => vi.useRealTimers());


describe('A receber · Splitwise', () => {
  const showHome = () => setup(<Home year={2026} month={10} colors={chartColors('light')} onPage={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} />);

  it('Início lists what others owe and keeps it out of "Livre para gastar" until it is received', async () => {
    const { user } = showHome();
    const card = await screen.findByRole('region', { name: 'A receber · Splitwise' });
    expect(card).toHaveTextContent(/40,00\s€ a receber de 1 divisão/);
    expect(within(card).getByText('pizza com amigos')).toBeInTheDocument();
    expect(within(card).queryByText('cinema')).not.toBeInTheDocument();

    // 1600 − 200 Mercado reserved (its average) − 20 − 90 − 25 − 18 = 1247; minus 40 still owed = 1207.
    const free = () => screen.getByText('Livre para gastar', { selector: 'p.label' }).closest('.card')!;
    expect(free()).toHaveTextContent(/1207,00\s€/);
    await user.click(screen.getByRole('button', { name: /Livre para gastar/ }));
    expect(screen.getByText('Adiantado no Splitwise, ainda a receber').nextSibling).toHaveTextContent(/−40,00\s€/);

    await user.click(within(card).getByRole('checkbox', { name: 'pizza com amigos: recebi' }));
    // Optimistic: the money is back at once.
    await waitFor(() => expect(free()).toHaveTextContent(/1247,00\s€/));
    await waitFor(async () => expect((await db.transactions.get('pizza'))?.split).toEqual({ people: 3, total: 60, receivedOn: '2026-10-22' }));
    expect(screen.queryByRole('region', { name: 'A receber · Splitwise' })).not.toBeInTheDocument();

    await undoToast(user, /40,00\s€ de “pizza com amigos” recebido/);
    await waitFor(async () => expect((await db.transactions.get('pizza'))?.split?.receivedOn).toBeUndefined());
    expect(await screen.findByRole('region', { name: 'A receber · Splitwise' })).toBeInTheDocument();
  });

  it('Contas shows pending splits and what came back this month, and can undo a receipt', async () => {
    const { user } = setup(<Bills year={2026} month={10} />);
    const box = await screen.findByRole('region', { name: 'A receber do Splitwise' });
    expect(within(box).getByRole('checkbox', { name: 'pizza com amigos: recebi' })).toHaveAttribute('aria-checked', 'false');
    expect(within(box).getByRole('checkbox', { name: 'cinema: recebi' })).toHaveAttribute('aria-checked', 'true');
    expect(within(box).getByText(/recebido 18 de out/)).toBeInTheDocument();
    await user.click(within(box).getByRole('checkbox', { name: 'cinema: recebi' }));
    await waitFor(async () => expect((await db.transactions.get('cine'))?.split).toEqual({ people: 2, total: 36 }));
  });
});

describe('Fora do normal e calendário', () => {
  const showHome = (onCategory = vi.fn()) => ({ onCategory, ...setup(<Home year={2026} month={10} colors={chartColors('light')} onPage={vi.fn()} onAdd={vi.fn()} onImport={vi.fn()} onCategory={onCategory} />) });

  it('flags the category above its usual pace by now and opens it', async () => {
    const { user, onCategory } = showHome();
    const box = await screen.findByRole('region', { name: 'Fora do normal · Outubro' });
    // Restaurante: 135 € by the 22nd vs a usual 60 €/month (≈ 42,58 € by now). Mercado is on pace.
    expect(within(box).getByText(/Restaurante/)).toBeInTheDocument();
    expect(within(box).queryByText(/Mercado/)).not.toBeInTheDocument();
    expect(within(box).getByText(/Normal até hoje: ~42,58\s€ \(média de 60,00\s€\/mês\)/)).toBeInTheDocument();
    await user.click(within(box).getByRole('button', { name: /Restaurante/ }));
    expect(onCategory).toHaveBeenCalledWith('Restaurante');
  });

  it('the calendar shades each day and opens its entries; future days are off', async () => {
    const { user } = showHome();
    const box = await screen.findByRole('region', { name: 'Calendário de gastos · Outubro' });
    expect(within(box).getByText(/Dia mais pesado: 120,00\s€/)).toBeInTheDocument();
    const eighth = within(box).getByRole('gridcell', { name: /^8 de outubro: 115,00\s€ em 2 lançamento/ });
    await user.click(eighth);
    expect(eighth).toHaveAttribute('aria-pressed', 'true');
    expect(within(box).getByText('sushi')).toBeInTheDocument();
    expect(within(box).getByRole('gridcell', { name: /^23 de outubro/ })).toBeDisabled();
    await user.click(eighth);
    expect(within(box).queryByText('sushi')).not.toBeInTheDocument();
  });
});

describe('App: URL, loading and errors', () => {
  const sidebar = () => screen.getAllByRole('navigation', { name: 'Principal' })[0];

  it('keeps the page and month in the URL, so a reload stays and Back returns', async () => {
    const first = setup(<App />);
    await screen.findByRole('heading', { name: 'Outubro 2026' });
    await first.user.click(within(sidebar()).getByRole('button', { name: /Transações/ }));
    expect(window.location.hash).toBe('#/transactions/2026/10');
    first.unmount();

    setup(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Transações' })).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, '', '#/home/2026/9');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(await screen.findByRole('heading', { name: 'Setembro 2026' })).toBeInTheDocument();
  });

  it('"Fora do normal" opens Transações filtered on that category', async () => {
    const { user } = setup(<App />);
    const box = await screen.findByRole('region', { name: 'Fora do normal · Outubro' });
    await user.click(within(box).getByRole('button', { name: /Restaurante/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Transações' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Categoria' })).toHaveValue('Restaurante');
    expect(window.location.hash).toBe('#/transactions/2026/10?categoria=Restaurante');
    expect(screen.queryByText('Salário')).not.toBeInTheDocument();
  });

  it('shows a skeleton while loading, and a retry when the server does not answer', async () => {
    let down = true;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      down ? Promise.reject(new TypeError('offline')) : fakeFetch(input, init)) as typeof fetch;
    try {
      const { user } = setup(<App />);
      expect(screen.getByLabelText('Carregando')).toBeInTheDocument();
      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent('Não consegui falar com o servidor.');
      expect(screen.queryByText(/Nada em 2026/)).not.toBeInTheDocument();
      down = false;
      await user.click(within(banner).getByRole('button', { name: /Tentar de novo/ }));
      expect(await screen.findByRole('heading', { name: 'Outubro 2026' })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText('Não consegui falar com o servidor.')).not.toBeInTheDocument());
    } finally {
      globalThis.fetch = fakeFetch;
    }
  });
});

