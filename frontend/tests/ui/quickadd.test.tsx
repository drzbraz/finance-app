import QuickAdd from '../../src/components/QuickAdd';
import type { Transaction } from '@finance/shared';
import { freezeToday, liveTxs, resetDb, screen, setup, undoToast, waitFor } from './render';

function open(history: Transaction[] = [], month = 10) {
  const onClose = vi.fn();
  const r = setup(<QuickAdd year={2026} month={month} history={history} onClose={onClose} />);
  return { ...r, onClose, amount: screen.getByPlaceholderText('0,00'), description: screen.getByPlaceholderText(/jantar com amigos/) };
}

const saved = async () => {
  await waitFor(async () => expect(await liveTxs()).toHaveLength(1));
  return (await liveTxs())[0];
};

describe('Novo lançamento (QuickAdd)', () => {
  beforeEach(async () => {
    freezeToday();
    await resetDb();
  });
  afterEach(() => vi.useRealTimers());

  it('focuses the amount first', () => {
    const { amount } = open();
    expect(amount).toHaveFocus();
  });

  it('saves amount + description, categorized by the rules, dated today', async () => {
    const { user, amount, description, onClose } = open();
    await user.type(amount, '25,50');
    await user.type(description, 'jantar com amigos');
    expect(screen.getByText('Sugerida pela descrição')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Salvar \d/ }));
    const t = await saved();
    expect(t).toMatchObject({ amount: 25.5, description: 'jantar com amigos', category: 'Restaurante', type: 'variable', date: '2026-10-22', month: 10, year: 2026, paid: true, categorySource: 'auto' });
    expect(t.source).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
  });

  it('"25 jantar #lisboa" typed in the amount fills amount, description and tag', async () => {
    const { user, amount, description } = open();
    await user.type(amount, '25 jantar #lisboa');
    expect(amount).toHaveValue('25');
    expect(description).toHaveValue('jantar #lisboa');
    await user.keyboard('{Enter}');
    const t = await saved();
    expect(t.description).toBe('jantar');
    expect(t.tags).toEqual(['lisboa']);
    expect(t.amount).toBe(25);
  });

  it('"12.5 uber" typed in the description also moves the number to the amount', async () => {
    const { user, amount, description } = open();
    await user.type(description, '12.5 uber');
    expect(amount).toHaveValue('12.5');
    expect(description).toHaveValue('uber');
  });

  it('requires an amount above zero', async () => {
    const { user, amount, description } = open();
    await user.type(description, 'jantar');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um valor maior que zero.');
    expect(amount).toHaveFocus();
    await user.type(amount, '0');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(await liveTxs()).toHaveLength(0);
  });

  it('description is optional: a variable expense becomes "(sem descrição)" in Outros', async () => {
    const { user, amount } = open();
    expect(screen.getByText('(opcional)')).toBeInTheDocument();
    await user.type(amount, '12');
    await user.keyboard('{Enter}');
    const t = await saved();
    expect(t).toMatchObject({ description: '(sem descrição)', category: 'Outros', amount: 12 });
    expect(await screen.findByText(/^Outros · 12,00\s€ adicionado$/)).toBeInTheDocument();
  });

  it('without a description, a fixed expense takes the chosen category as its name', async () => {
    const { user, amount } = open();
    await user.type(amount, '700');
    await user.click(screen.getByRole('radio', { name: 'Fixa' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /Categoria/ }), 'Casa');
    await user.click(screen.getByRole('button', { name: /^Salvar \d/ }));
    const t = await saved();
    expect(t).toMatchObject({ description: 'Casa', category: 'Casa', type: 'fixed', categorySource: 'manual' });
  });

  it('fixed expenses and income start pending, variable ones paid', async () => {
    const { user, amount } = open();
    await user.type(amount, '50');
    await user.click(screen.getByRole('radio', { name: 'Receita' }));
    expect(screen.getByRole('checkbox', { name: 'Já recebido' })).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Fixa' }));
    expect(screen.getByRole('checkbox', { name: 'Já pago' })).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Variável' }));
    expect(screen.getByRole('checkbox', { name: 'Já pago' })).toBeChecked();
  });

  it('a manual category wins over the suggestion and is marked manual', async () => {
    const { user, amount, description } = open();
    await user.type(amount, '30');
    await user.type(description, 'jantar');
    await user.selectOptions(screen.getByRole('combobox', { name: /Categoria/ }), 'Lazer');
    // Enter inside a select only picks the option; it must not save.
    await user.keyboard('{Enter}');
    expect(await liveTxs()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /^Salvar \d/ }));
    expect(await saved()).toMatchObject({ category: 'Lazer', categorySource: 'manual' });
  });

  it('a known description prefills its type and manual category', async () => {
    const history = [
      { id: 'h1', year: 2026, month: 9, date: '2026-09-03', description: 'Ginásio', amount: 40, type: 'fixed', category: 'Saúde', categorySource: 'manual', tags: [], paid: true },
    ] satisfies Transaction[];
    const { user, amount, description } = open(history);
    await user.type(amount, '40');
    await user.type(description, 'Ginásio');
    expect(screen.getByRole('radio', { name: 'Fixa' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('combobox', { name: /Categoria/ })).toHaveValue('Saúde');
  });

  it('Ctrl+Enter saves and keeps the dialog open, ready for the next one', async () => {
    const { user, amount, description, onClose } = open();
    await user.type(amount, '5');
    await user.type(description, 'cafe');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await saved();
    expect(onClose).not.toHaveBeenCalled();
    expect(amount).toHaveValue('');
    expect(description).toHaveValue('');
    expect(amount).toHaveFocus();
  });

  it('a month other than the current one defaults to its 1st day', async () => {
    const { user, amount } = open([], 3);
    expect(screen.getByDisplayValue('2026-03-01')).toBeInTheDocument();
    await user.type(amount, '9');
    await user.keyboard('{Enter}');
    expect(await saved()).toMatchObject({ month: 3, date: '2026-03-01' });
  });

  it('changing the date moves the entry to that month', async () => {
    const { user, amount } = open();
    const date = screen.getByDisplayValue('2026-10-22');
    await user.clear(date);
    await user.type(date, '2026-11-05');
    await user.type(amount, '9');
    await user.click(screen.getByRole('button', { name: /^Salvar \d/ }));
    expect(await saved()).toMatchObject({ month: 11, date: '2026-11-05' });
  });

  it('"Desfazer" on the toast removes the entry again', async () => {
    const { user, amount, description } = open();
    await user.type(amount, '5');
    await user.type(description, 'cafe');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await saved();
    await undoToast(user, /cafe · .* adicionado/);
    await waitFor(async () => expect(await liveTxs()).toHaveLength(0));
  });

  it('"Paguei e dividi no Splitwise" keeps only my share, with what I paid and for how many', async () => {
    const { user, amount, description } = open();
    await user.type(amount, '90');
    await user.type(description, 'jantar');
    await user.click(screen.getByRole('checkbox', { name: 'Paguei e dividi no Splitwise' }));
    expect(screen.getByText('Valor total pago')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Já pago' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mais uma pessoa' }));
    expect(screen.getByRole('spinbutton', { name: 'Pessoas' })).toHaveValue(3);
    expect(screen.getByText(/Sua parte:/)).toHaveTextContent(/Sua parte: 30,00\s€ de 90,00\s€/);
    await user.click(screen.getByRole('button', { name: /^Salvar 30,00/ }));
    expect(await saved()).toMatchObject({ amount: 30, split: { people: 3, total: 90 }, paid: true });
  });

  it('income and investments cannot be split', async () => {
    const { user } = open();
    await user.click(screen.getByRole('radio', { name: 'Receita' }));
    expect(screen.queryByRole('checkbox', { name: /Splitwise/ })).not.toBeInTheDocument();
  });

  it('Esc closes without saving', async () => {
    const { user, amount, onClose } = open();
    await user.type(amount, '5');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(await liveTxs()).toHaveLength(0);
  });
});
