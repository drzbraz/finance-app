import StatementImport from '../../src/components/StatementImport';
import { buildStatement } from '../../../backend/src/testing/statement.fixture';
import { db } from './fakeApi';
import { freezeToday, liveTxs, resetDb, screen, seed, setup, undoToast, waitFor, within } from './render';

const pdf = async (name = 'Extrato Combinado 2026009.pdf', options = {}) => new File([await buildStatement(options)], name, { type: 'application/pdf' });
const fileInput = () => document.querySelector<HTMLInputElement>('input[type=file]')!;
const line = (name: string) => screen.getByRole('checkbox', { name: `Lançar ${name}` }).closest('li')!;
const section = (name: RegExp) => screen.getByRole('region', { name });

describe('Importar extrato (PDF)', () => {
  beforeEach(async () => {
    freezeToday();
    await resetDb();
    // Already in the app from the sheet: the jiu-jitsu debit of the statement.
    await seed({ txs: [{ id: 'jiu', month: 9, date: '2026-09-01', description: 'Jiu Jitsu', amount: 80, type: 'fixed', category: 'Saúde' }] });
  });
  afterEach(() => vi.useRealTimers());

  const show = () => {
    const onImported = vi.fn();
    const onClose = vi.fn();
    return { onImported, onClose, ...setup(<StatementImport onClose={onClose} onImported={onImported} />) };
  };

  it('splits the lines into ready and to decide, and records the ready ones with one click', async () => {
    const { user, onImported, onClose } = show();
    await user.upload(fileInput(), await pdf());
    expect(await screen.findByText('9 movimentos · ActivoBank, 01/09 a 30/09/2026')).toBeInTheDocument();
    expect(screen.getByText('3 prontos para lançar · 6 para você decidir')).toBeInTheDocument();

    const ready = section(/^Prontos para lançar · 3/);
    expect(within(ready).getAllByRole('checkbox', { name: /^Lançar/ }).map((c) => (c as HTMLInputElement).checked)).toEqual([true, true, true]);
    expect(within(ready).getByText('Continente Bag')).toBeInTheDocument();
    expect(within(line('Continente Bag')).getByRole('combobox', { name: 'Categoria de Continente Bag' })).toHaveValue('Mercado');

    const decide = section(/^Para você decidir · 6/);
    expect(within(decide).getAllByRole('checkbox', { name: /^Lançar/ }).every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    expect(within(line('Gracie Barra')).getByText('Parece já lançado: “Jiu Jitsu” · 80,00 € · 01/09')).toBeInTheDocument();
    expect(within(line('Transferência para Ana Maria Teste Silva')).getByText(/Para outra conta sua/)).toBeInTheDocument();
    expect(within(line('Transferência de Ana Maria Teste Silva')).getByText(/Veio de outra conta sua/)).toBeInTheDocument();
    expect(within(line('Mangopay')).getByText(/Entrada de dinheiro/)).toBeInTheDocument();
    expect(within(line('Transferência para Joao Exemplo (MB WAY)')).getByText(/Transferência: aluguel/)).toBeInTheDocument();
    expect(within(line('Sinfonia Amarela Tel 22')).getByText('Não reconheci a categoria: escolha uma.')).toBeInTheDocument();

    expect(await liveTxs()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Lançar 3' }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(2026, 9));
    expect(onClose).toHaveBeenCalled();
    const saved = (await liveTxs()).filter((t) => t.id.startsWith('stm-'));
    expect(saved.map((t) => [t.date, t.description, t.amount, t.type, t.category]).sort()).toEqual([
      ['2026-09-01', 'Continente Bag', 29.23, 'variable', 'Mercado'],
      ['2026-09-03', 'Comissão da conta', 3.99, 'variable', 'Outros'],
      ['2026-09-03', 'Google Chrome 65', 4.31, 'variable', 'Assinaturas'],
    ]);
    expect(saved.every((t) => t.paid && t.month === 9 && t.year === 2026)).toBe(true);
  });

  it('records what the user decides, with the type and category they chose', async () => {
    const { user } = show();
    await user.upload(fileInput(), await pdf());
    await screen.findByText(/9 movimentos/);

    // Picking a category selects the line; the choice is kept as manual.
    await user.selectOptions(within(line('Sinfonia Amarela Tel 22')).getByRole('combobox', { name: /^Categoria/ }), 'Lazer');
    expect(screen.getByRole('checkbox', { name: 'Lançar Sinfonia Amarela Tel 22' })).toBeChecked();
    // The 2 500 € to my other account was really an investment: tick it as suggested.
    await user.click(screen.getByRole('checkbox', { name: 'Lançar Transferência para Ana Maria Teste Silva' }));
    // The MB WAY transfer was a dinner split: change it to a variable Restaurante entry.
    await user.selectOptions(within(line('Transferência para Joao Exemplo (MB WAY)')).getByRole('combobox', { name: /^Categoria/ }), 'Restaurante');
    // Not this bank fee.
    await user.click(screen.getByRole('checkbox', { name: 'Lançar Comissão da conta' }));
    expect(screen.getByText(/^5 selecionado\(s\) · 2\s?594,82\s€ em saídas$/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lançar 5' }));
    await waitFor(async () => expect((await liveTxs()).length).toBe(6));
    const byName = new Map((await liveTxs()).map((t) => [t.description, t]));
    expect(byName.get('Sinfonia Amarela Tel 22')).toMatchObject({ category: 'Lazer', categorySource: 'manual', type: 'variable' });
    expect(byName.get('Transferência para Ana Maria Teste Silva')).toMatchObject({ type: 'investment', category: 'Investimento', amount: 2500 });
    expect(byName.get('Transferência para Joao Exemplo (MB WAY)')).toMatchObject({ category: 'Restaurante', amount: 57.08 });
    expect(byName.has('Comissão da conta')).toBe(false);
  });

  it('changing the type of money in to an expense lets the user pick a category', async () => {
    const { user } = show();
    await user.upload(fileInput(), await pdf());
    await screen.findByText(/9 movimentos/);
    const mangopay = line('Mangopay');
    expect(within(mangopay).queryByRole('combobox', { name: /^Categoria/ })).not.toBeInTheDocument();
    await user.selectOptions(within(mangopay).getByRole('combobox', { name: 'Tipo de Mangopay' }), 'variable');
    expect(within(mangopay).getByRole('combobox', { name: /^Categoria/ })).toHaveValue('Receita');
    await user.selectOptions(within(mangopay).getByRole('combobox', { name: 'Tipo de Mangopay' }), 'investment');
    expect(within(mangopay).queryByRole('combobox', { name: /^Categoria/ })).not.toBeInTheDocument();
  });

  it('"Marcar todos" ticks a whole section; undo removes what was recorded', async () => {
    const { user } = show();
    await user.upload(fileInput(), await pdf());
    await screen.findByText(/9 movimentos/);
    await user.click(within(section(/^Para você decidir/)).getByRole('button', { name: 'Marcar todos' }));
    await user.click(screen.getByRole('button', { name: 'Lançar 9' }));
    await waitFor(async () => expect((await liveTxs()).length).toBe(10));
    await undoToast(user, '9 lançamento(s) do extrato');
    await waitFor(async () => expect((await liveTxs()).map((t) => t.id)).toEqual(['jiu']));
  });

  it('a statement imported before shows its lines as already imported, not selectable again', async () => {
    const first = show();
    await first.user.upload(fileInput(), await pdf());
    await first.user.click(await screen.findByRole('button', { name: 'Lançar 3' }));
    await waitFor(() => expect(first.onImported).toHaveBeenCalled());
    first.unmount();

    const again = show();
    await again.user.upload(fileInput(), await pdf());
    expect(await screen.findByText('0 prontos para lançar · 6 para você decidir · 3 já importados antes')).toBeInTheDocument();
    expect(screen.getByText('Já importados deste extrato · 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lançar 0' })).toBeDisabled();
  });

  it('reads a PDF dropped on the window right away', async () => {
    setup(<StatementImport initialFile={await pdf()} onClose={vi.fn()} onImported={vi.fn()} />);
    expect(await screen.findByText(/9 movimentos/)).toBeInTheDocument();
  });

  it('says so when the file is not a statement it knows', async () => {
    const { user } = show();
    await user.upload(fileInput(), await pdf('outro.pdf', { bank: 'Outro Banco' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not supported/);
    expect(await db.transactions.count()).toBe(1);
  });
});
