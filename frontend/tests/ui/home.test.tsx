import { db } from './fakeApi';
import Home from '../../src/pages/Home';
import { chartColors } from '../../src/theme';
import { freezeToday, resetDb, screen, seed, setup, waitFor, within } from './render';

// October 2026 (today = 22/10): income 2200, rent 700 (pending, due 25), ETF 300,
// groceries 100 spent of a 250 Mercado limit, cinema 50.
const OCT = [
  { id: 'sal', month: 10, date: '2026-10-01', description: 'Salário', amount: 2200, type: 'income' as const, category: 'Receita' },
  { id: 'rent', month: 10, date: '2026-10-25', description: 'Aluguel', amount: 700, type: 'fixed' as const, category: 'Casa', paid: false },
  { id: 'etf', month: 10, date: '2026-10-02', description: 'ETF', amount: 300, type: 'investment' as const, category: 'Investimento' },
  { id: 'merc', month: 10, date: '2026-10-10', description: 'Mercado', amount: 100, category: 'Mercado' },
  { id: 'fun', month: 10, date: '2026-10-12', description: 'cinema', amount: 50, category: 'Lazer' },
];
const SEPT = [
  { id: 's-sal', month: 9, description: 'Salário', amount: 2000, type: 'income' as const, category: 'Receita' },
  { id: 's-rent', month: 9, description: 'Aluguel', amount: 700, type: 'fixed' as const, category: 'Casa' },
  { id: 's-food', month: 9, description: 'Mercado', amount: 400, category: 'Mercado' },
];

const kpi = (label: string) => screen.getByText(label).closest('.card') as HTMLElement;

describe('Início', () => {
  beforeEach(async () => {
    freezeToday();
    await resetDb();
  });
  afterEach(() => vi.useRealTimers());

  const show = (month = 10, year = 2026) => {
    const props = { onPage: vi.fn(), onAdd: vi.fn(), onImport: vi.fn() };
    return { ...props, ...setup(<Home year={year} month={month} colors={chartColors('light')} {...props} />) };
  };

  it('an empty year invites to import or add', async () => {
    const { user, onImport, onAdd } = show(10, 2030);
    expect(await screen.findByText('Nada em 2030 ainda')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Importar planilha' }));
    await user.click(screen.getByRole('button', { name: '+ Novo lançamento' }));
    expect(onImport).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('"Livre para gastar" = income − fixed − investments − groceries reserve − other spending', async () => {
    await seed({ txs: [...OCT, ...SEPT], budgets: [{ category: 'Mercado', monthlyLimit: 250 }], recurring: [{ key: 'fixed|Aluguel', type: 'fixed', description: 'Aluguel', dueDay: 25, active: true }] });
    const { user } = show();
    await screen.findByText('Livre para gastar');
    // 2200 − 700 − 300 − 250 − 50 = 900, over 10 days left (22 → 31).
    await waitFor(() => expect(kpi('Livre para gastar')).toHaveTextContent(/900,00\s€/));
    expect(kpi('Livre para gastar')).toHaveTextContent(/≈ 90,00\s€\/dia por 10 dia\(s\)/);

    await user.click(screen.getByRole('button', { name: /Livre para gastar/ }));
    const box = screen.getByRole('heading', { name: /Como chegamos em 900,00/ }).closest('section')!;
    const line = (label: RegExp) => within(box).getByText(label).closest('li')!;
    expect(line(/Receita do mês/)).toHaveTextContent(/\+2200,00\s€/);
    expect(line(/Contas fixas/)).toHaveTextContent(/−700,00\s€/);
    expect(line(/Investimentos/)).toHaveTextContent(/−300,00\s€/);
    expect(line(/Mercado \(reservado: seu limite\)/)).toHaveTextContent(/gasto até agora 100,00\s€.*−250,00\s€/);
    expect(line(/Outros gastos variáveis/)).toHaveTextContent(/−50,00\s€/);
  });

  it('without a Mercado limit, the grocery reserve is the average of earlier months', async () => {
    await seed({ txs: [...OCT, ...SEPT] });
    const { user } = show();
    // 2200 − 700 − 300 − 400 (September average) − 50 = 750
    await waitFor(() => expect(kpi('Livre para gastar')).toHaveTextContent(/750,00\s€/));
    await user.click(screen.getByRole('button', { name: /Livre para gastar/ }));
    expect(screen.getByText(/Mercado \(reservado: sua média\)/)).toBeInTheDocument();
  });

  it('shows the overspend in red when nothing is left', async () => {
    await seed({ txs: [...OCT, { id: 'big', month: 10, description: 'dentista', amount: 1500, category: 'Saúde' }] });
    show();
    await waitFor(() => expect(kpi('Livre para gastar')).toHaveTextContent('Você já passou do que tinha livre'));
    expect(kpi('Livre para gastar').querySelector('.text-bad')).not.toBeNull();
  });

  it('a past month shows its saldo and the year-to-date balance instead', async () => {
    await seed({ txs: [...OCT, ...SEPT] });
    show(9);
    await screen.findByText('Saldo do mês');
    expect(screen.queryByText('Livre para gastar')).not.toBeInTheDocument();
    // September: 2000 − 700 − 400 = 900
    expect(kpi('Saldo do mês')).toHaveTextContent(/900,00\s€/);
    expect(kpi('Saldo do mês')).toHaveTextContent(/Acumulado no ano: 900,00\s€/);
  });

  it('"Próximas contas" lists bills due within 7 days and can mark them paid', async () => {
    await seed({ txs: [...OCT, ...SEPT], recurring: [{ key: 'fixed|Aluguel', type: 'fixed', description: 'Aluguel', dueDay: 25, active: true }] });
    const { user } = show();
    const card = (await screen.findByRole('heading', { name: 'Próximas contas' })).closest('section')!;
    // Wait for the recorded entry (700 €), not just the stored bill: only then does the check mark it paid.
    await waitFor(() => expect(within(card).getByText('Aluguel').closest('li')).toHaveTextContent(/700,00\s€/));
    await user.click(within(card).getByRole('checkbox', { name: 'Aluguel pago' }));
    await waitFor(async () => expect((await db.transactions.get('rent'))?.paid).toBe(true));
    await waitFor(() => expect(within(card).getByText(/Nada atrasado/)).toBeInTheDocument());
  });

  it('shows the month\'s biggest expenses and the main goal, which opens Metas', async () => {
    await seed({ txs: [...OCT, ...SEPT] });
    await db.goals.put({ id: 'g', name: 'Viagem', target: 1000, currency: 'EUR', source: 'manual', contributions: [{ date: '2026-10-01', amount: 250 }], createdAt: '2026-01-01' });
    const { user, onPage } = show();
    const top = (await screen.findByRole('heading', { name: /Maiores gastos/ })).closest('section')!;
    // Fixed bills count as expenses: rent first.
    expect(within(top).getAllByRole('listitem')[0]).toHaveTextContent('Aluguel');
    await waitFor(() => expect(kpi('Meta · Viagem')).toHaveTextContent('25%'));
    await user.click(screen.getByRole('button', { name: /Meta · Viagem/ }));
    expect(onPage).toHaveBeenCalledWith('goals');
  });
});
