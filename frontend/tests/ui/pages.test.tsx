import { fireEvent } from '@testing-library/react';
import { db } from './fakeApi';
import { getSettings } from './fakeApi';
import Budgets from '../../src/pages/Budgets';
import Compare from '../../src/pages/Compare';
import Goals from '../../src/pages/Goals';
import SettingsPage from '../../src/pages/Settings';
import { chartColors } from '../../src/theme';
import { freezeToday, resetDb, screen, seed, setup, undoToast, waitFor, within } from './render';

beforeEach(async () => {
  freezeToday();
  await resetDb();
});
afterEach(() => vi.useRealTimers());

describe('Orçamentos', () => {
  beforeEach(() =>
    seed({
      txs: [
        { month: 8, description: 'jantar', amount: 100, category: 'Restaurante' },
        { month: 9, description: 'jantar', amount: 200, category: 'Restaurante' },
        { month: 10, description: 'jantar', amount: 130, category: 'Restaurante' },
        { month: 10, description: 'uber', amount: 20, category: 'Transporte' },
      ],
    }),
  );
  const show = () => setup(<Budgets year={2026} month={10} />);
  const card = (cat: string) => screen.getByRole('textbox', { name: `Limite de ${cat}` }).closest('.card') as HTMLElement;

  it('adds a budget by category with Enter, and shows ok / 80% / over states', async () => {
    const { user } = show();
    await screen.findByText(/Gastos de Outubro sem orçamento/);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'Restaurante');
    await user.type(screen.getByPlaceholderText('Limite €'), '150{Enter}');
    await waitFor(async () => expect(await db.budgets.get('Restaurante')).toEqual({ category: 'Restaurante', monthlyLimit: 150 }));
    // 130 of 150 = 87%: warning
    expect(within(await waitFor(() => card('Restaurante'))).getByText(/⚠ Atenção: 80% usado/)).toBeInTheDocument();
    expect(card('Restaurante')).toHaveTextContent(/sobram 20,00\s€/);

    const limit = screen.getByRole('textbox', { name: 'Limite de Restaurante' });
    await user.clear(limit);
    await user.type(limit, '100');
    await user.tab();
    await waitFor(() => expect(card('Restaurante')).toHaveTextContent('✕ Estourou'));
    expect(card('Restaurante')).toHaveTextContent(/30,00\s€ acima/);

    await user.clear(screen.getByRole('textbox', { name: 'Limite de Restaurante' }));
    await user.type(screen.getByRole('textbox', { name: 'Limite de Restaurante' }), '500');
    await user.tab();
    await waitFor(() => expect(card('Restaurante')).toHaveTextContent('✓ Dentro do limite'));
  });

  it('an emptied limit is ignored, never saved as 0', async () => {
    await seed({ budgets: [{ category: 'Transporte', monthlyLimit: 60 }] });
    const { user } = show();
    const limit = await screen.findByRole('textbox', { name: 'Limite de Transporte' });
    await user.clear(limit);
    await user.tab();
    expect(await db.budgets.get('Transporte')).toEqual({ category: 'Transporte', monthlyLimit: 60 });
  });

  it('"Sugerir pela média" fills limits from earlier months and can be undone', async () => {
    const { user } = show();
    await screen.findByText(/Gastos de Outubro sem orçamento/);
    await user.click(screen.getByRole('button', { name: /Sugerir pela média/ }));
    await waitFor(async () => expect(await db.budgets.get('Restaurante')).toBeDefined());
    expect((await db.budgets.get('Restaurante'))!.monthlyLimit).toBeGreaterThan(0);
    await undoToast(user, /sugerido\(s\) pela sua média/);
    await waitFor(async () => expect(await db.budgets.count()).toBe(0));
  });

  it('a chip of a category spent without budget preselects it', async () => {
    const { user } = show();
    await user.click(await screen.findByRole('button', { name: /Transporte · 20,00/ }));
    expect(screen.getByRole('combobox', { name: 'Categoria' })).toHaveValue('Transporte');
  });

  it('"Remover orçamento" deletes it', async () => {
    await seed({ budgets: [{ category: 'Transporte', monthlyLimit: 60 }] });
    const { user } = show();
    await user.click(await screen.findByRole('button', { name: 'Remover orçamento' }));
    await waitFor(async () => expect(await db.budgets.count()).toBe(0));
  });
});

describe('Metas', () => {
  const show = () => setup(<Goals year={2026} />);

  it('creates a goal, adds a contribution and shows the progress', async () => {
    const { user } = show();
    await user.click(await screen.findByRole('button', { name: 'Criar meta' }));
    const dialog = screen.getByRole('dialog', { name: 'Nova meta' });
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Nome'), 'Viagem Japão');
    await user.type(within(dialog).getByLabelText('Valor alvo'), '3000');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('heading', { name: 'Viagem Japão' })).toBeInTheDocument();
    expect(screen.getByText('Sem ritmo ainda: adicione um aporte.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Aporte' }));
    const aporte = screen.getByRole('dialog', { name: 'Aporte · Viagem Japão' });
    await user.type(within(aporte).getByLabelText(/Valor/), '750');
    await user.click(within(aporte).getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(screen.getByText('25%')).toBeInTheDocument());
    const [goal] = await db.goals.toArray();
    expect(goal).toMatchObject({ name: 'Viagem Japão', target: 3000, currency: 'EUR', source: 'manual', contributions: [{ date: '2026-10-22', amount: 750 }] });
  });

  it('a reached goal is celebrated', async () => {
    await db.goals.put({ id: 'g', name: 'Reserva', target: 100, currency: 'EUR', source: 'manual', contributions: [{ date: '2026-10-01', amount: 100 }], createdAt: '2026-01-01' });
    show();
    expect(await screen.findByText('🎉 Meta atingida!')).toBeInTheDocument();
  });

  it('the Patrimônio goal follows patrimony BR + EU × rate', async () => {
    await db.settings.put({ ...(await getSettings()), id: 'settings', patrimonyBR: 50000, patrimonyEU: 5000, eurBrlRate: 6 });
    await db.goals.put({ id: 'goal-patrimonio', name: 'Patrimônio', target: 160000, currency: 'BRL', source: 'patrimony', contributions: [], createdAt: '2026-01-01' });
    show();
    // 50.000 + 5.000 × 6 = 80.000 of 160.000
    expect(await screen.findByText('50%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Aporte' })).not.toBeInTheDocument();
  });

  it('deleting a goal can be undone', async () => {
    await db.goals.put({ id: 'g', name: 'Carro', target: 100, currency: 'EUR', source: 'manual', contributions: [], createdAt: '2026-01-01' });
    const { user } = show();
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    await waitFor(async () => expect(await db.goals.count()).toBe(0));
    await undoToast(user, 'Meta Carro excluída');
    await waitFor(async () => expect(await db.goals.count()).toBe(1));
  });

  it('editing keeps the contributions', async () => {
    await db.goals.put({ id: 'g', name: 'Carro', target: 100, currency: 'EUR', source: 'manual', contributions: [{ date: '2026-10-01', amount: 10 }], createdAt: '2026-01-01' });
    const { user } = show();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const name = within(screen.getByRole('dialog')).getByLabelText('Nome');
    await user.clear(name);
    await user.type(name, 'Moto');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Salvar' }));
    await waitFor(async () => expect(await db.goals.get('g')).toMatchObject({ name: 'Moto', contributions: [{ amount: 10 }] }));
  });
});

describe('Comparar', () => {
  const show = () => setup(<Compare year={2026} month={10} colors={chartColors('light')} />);

  it('asks for another year when there is only one', async () => {
    await seed({ txs: [{ month: 1, amount: 10 }] });
    show();
    expect(await screen.findByText('Importe outro ano para comparar')).toBeInTheDocument();
  });

  it('compares the same period by default, ignoring pending zero placeholders later in the year', async () => {
    await seed({
      txs: [
        { year: 2025, month: 1, description: 'jantar', amount: 100, category: 'Restaurante' },
        { year: 2025, month: 11, description: 'viagem', amount: 1000, category: 'Viagem' },
        { year: 2026, month: 1, description: 'jantar', amount: 150, category: 'Restaurante' },
        { year: 2026, month: 2, description: 'curso', amount: 50, category: 'Educação' },
        { year: 2026, month: 11, description: 'Aluguel', amount: 0, type: 'fixed', category: 'Casa', paid: false },
      ],
    });
    const { user } = show();
    expect(await screen.findByRole('heading', { name: '2025 vs 2026' })).toBeInTheDocument();
    // Waits for 2026 to load: until then the period falls back to the selected month.
    expect(await screen.findByText(/Comparando Jan–Fev \(2026 tem dados até Fevereiro\)/)).toBeInTheDocument();
    const expenses = screen.getByText('Despesas').closest('.card') as HTMLElement;
    // 2025 may arrive a moment after 2026.
    await waitFor(() => expect(expenses).toHaveTextContent(/2025: 100,00\s€/));
    expect(expenses).toHaveTextContent(/200,00\s€/);
    const row = (cat: string) => screen.getByRole('cell', { name: new RegExp(cat) }).closest('tr')!;
    expect(row('Educação')).toHaveTextContent('novo');
    expect(screen.queryByRole('cell', { name: /Viagem/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Ano todo' }));
    expect(screen.getByText(/Comparando ano todo/)).toBeInTheDocument();
    expect(row('Viagem')).toHaveTextContent(/1000,00\s€/);
  });
});

describe('Configurações', () => {
  const show = () => setup(<SettingsPage />);

  it('saves the exchange rate and the savings target (in %)', async () => {
    const { user } = show();
    const rate = await screen.findByLabelText(/Câmbio/);
    await user.clear(rate);
    await user.type(rate, '6.1234');
    await user.tab();
    await waitFor(async () => expect((await getSettings()).eurBrlRate).toBe(6.1234));
    const target = screen.getByLabelText(/Meta de taxa de poupança/);
    await user.clear(target);
    await user.type(target, '35');
    await user.tab();
    await waitFor(async () => expect((await getSettings()).savingsRateTarget).toBeCloseTo(0.35));
  });

  it('an emptied or negative field is never saved', async () => {
    const before = (await getSettings()).eurBrlRate;
    const { user } = show();
    const rate = await screen.findByLabelText(/Câmbio/);
    await user.clear(rate);
    await user.tab();
    fireEvent.blur(Object.assign(screen.getByLabelText(/Câmbio/), { value: '-1' }));
    expect((await getSettings()).eurBrlRate).toBe(before);
  });

  it('switches the theme', async () => {
    const { user } = show();
    await user.click(await screen.findByRole('radio', { name: /Escuro/ }));
    await waitFor(async () => expect((await getSettings()).theme).toBe('dark'));
  });

  it('lists custom rules and removes one', async () => {
    await db.rules.put({ id: 'r1', keyword: 'padaria', category: 'Mercado', priority: 50 });
    const { user } = show();
    expect(await screen.findByText('“padaria” → Mercado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover regra padaria' }));
    await waitFor(async () => expect(await db.rules.get('r1')).toBeUndefined());
  });

  it('deleting a year asks for confirmation first', async () => {
    await seed({ txs: [{ year: 2025, month: 1 }, { year: 2026, month: 1 }] });
    const { user } = show();
    await user.click((await screen.findAllByRole('button', { name: 'Apagar ano…' }))[0]);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await db.transactions.count()).toBe(2);
    await user.click(screen.getAllByRole('button', { name: 'Apagar ano…' })[0]);
    await user.click(screen.getByRole('button', { name: 'Apagar 2025' }));
    await waitFor(async () => expect((await db.transactions.toArray()).map((t) => t.year)).toEqual([2026]));
  });
});
