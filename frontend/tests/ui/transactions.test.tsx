import { db } from './fakeApi';
import Transactions from '../../src/pages/Transactions';
import { fireEvent } from '@testing-library/react';
import { freezeToday, liveTxs, resetDb, screen, seed, setup, undoToast, waitFor, within } from './render';

const DATA = [
  { id: 'a', month: 10, date: '2026-10-20', description: 'jantar sushi', amount: 30, category: 'Restaurante', tags: ['lisboa'] },
  { id: 'b', month: 10, date: '2026-10-21', description: 'Farmácia', amount: 12, category: 'Saúde' },
  { id: 'c', month: 10, date: '2026-10-01', description: 'Aluguel', amount: 700, type: 'fixed' as const, category: 'Casa', paid: false, source: { sheet: 'Listas de itens', cell: 'K11' } },
  { id: 'd', month: 10, date: '2026-10-05', description: 'Salário', amount: 2200, type: 'income' as const, category: 'Receita' },
  { id: 'e', month: 9, date: '2026-09-10', description: 'cinema', amount: 9, category: 'Lazer' },
];

const rowNames = () => screen.queryAllByRole('button').filter((b) => b.className.includes('cursor-pointer')).map((b) => b.querySelector('p')?.textContent);

describe('Transações', () => {
  beforeEach(async () => {
    freezeToday();
    await resetDb();
    await seed({ txs: DATA });
  });
  afterEach(() => vi.useRealTimers());

  const show = () => setup(<Transactions year={2026} month={10} onAdd={vi.fn()} />);

  it('lists only the selected month, newest first, with totals', async () => {
    show();
    expect(await screen.findByText('Farmácia')).toBeInTheDocument();
    expect(rowNames()).toEqual(['Farmácia', 'jantar sushi', 'Salário', 'Aluguel']);
    expect(screen.queryByText('cinema')).not.toBeInTheDocument();
    expect(screen.getByText(/4 lançamento\(s\) · entradas 2200,00\s€ · saídas 742,00\s€/)).toBeInTheDocument();
  });

  it('has no paid checkbox per entry (that lives in Contas)', async () => {
    show();
    await screen.findByText('Farmácia');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('"Ano todo" shows every month', async () => {
    const { user } = show();
    await screen.findByText('Farmácia');
    await user.click(screen.getByRole('button', { name: 'Ano todo' }));
    expect(screen.getByText('cinema')).toBeInTheDocument();
  });

  it('search ignores case and accents and also matches category and tags', async () => {
    const { user } = show();
    await screen.findByText('Farmácia');
    const box = screen.getByPlaceholderText(/Buscar/);
    await user.type(box, 'FARMACIA');
    expect(rowNames()).toEqual(['Farmácia']);
    await user.clear(box);
    await user.type(box, 'lisboa');
    expect(rowNames()).toEqual(['jantar sushi']);
    await user.clear(box);
    await user.type(box, 'casa');
    expect(rowNames()).toEqual(['Aluguel']);
  });

  it('type, status, tag and category filters combine, and "Limpar filtros" resets them', async () => {
    const { user } = show();
    await screen.findByText('Farmácia');
    await user.click(screen.getByRole('button', { name: 'Fixas' }));
    expect(rowNames()).toEqual(['Aluguel']);
    await user.click(screen.getByRole('button', { name: 'Receitas' }));
    expect(rowNames()).toEqual(['Salário', 'Aluguel']);
    await user.click(screen.getByRole('button', { name: 'Pendentes' }));
    expect(rowNames()).toEqual(['Aluguel']);
    await user.click(screen.getByRole('button', { name: /Limpar filtros/ }));
    expect(rowNames()).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: '#lisboa' }));
    expect(rowNames()).toEqual(['jantar sushi']);
    await user.click(screen.getByRole('button', { name: '#lisboa' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'Saúde');
    expect(rowNames()).toEqual(['Farmácia']);
  });

  it('shows an empty state when nothing matches', async () => {
    const { user } = show();
    await screen.findByText('Farmácia');
    await user.type(screen.getByPlaceholderText(/Buscar/), 'zzz');
    expect(screen.getByText('Nada com esses filtros')).toBeInTheDocument();
  });

  it('soft-deleted entries are hidden', async () => {
    await db.transactions.update('b', { deleted: true });
    show();
    await screen.findByText('jantar sushi');
    expect(screen.queryByText('Farmácia')).not.toBeInTheDocument();
  });

  describe('editing (side panel)', () => {
    it('changes the amount and records the change time', async () => {
      const { user } = show();
      await user.click(await screen.findByText('Farmácia'));
      const amount = screen.getByDisplayValue('12');
      await user.clear(amount);
      await user.type(amount, '15,40');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(async () => expect((await db.transactions.get('b'))?.amount).toBe(15.4));
      expect((await db.transactions.get('b'))?.updatedAt).toBeTruthy();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('a new description is categorized again by the rules', async () => {
      const { user } = show();
      await user.click(await screen.findByText('Farmácia'));
      const desc = screen.getByDisplayValue('Farmácia');
      await user.clear(desc);
      await user.type(desc, 'uber aeroporto');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(async () => expect((await db.transactions.get('b'))?.category).toBe('Transporte'));
    });

    it('a cleared description falls back to "(sem descrição)"', async () => {
      const { user } = show();
      await user.click(await screen.findByText('Farmácia'));
      await user.clear(screen.getByDisplayValue('Farmácia'));
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(async () => expect((await db.transactions.get('b'))?.description).toBe('(sem descrição)'));
    });

    it('moving the date moves the entry to that month', async () => {
      const { user } = show();
      await user.click(await screen.findByText('Farmácia'));
      // A date picker sets the whole value at once.
      fireEvent.change(screen.getByDisplayValue('2026-10-21'), { target: { value: '2026-08-02' } });
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(async () => expect(await db.transactions.get('b')).toMatchObject({ month: 8, date: '2026-08-02' }));
    });

    it('a manual category offers a rule that recategorizes matching entries', async () => {
      await seed({ txs: [{ id: 'f', month: 7, description: 'jantar barco', amount: 20, category: 'Restaurante' }] });
      const { user } = show();
      await user.click(await screen.findByText('jantar sushi'));
      await user.selectOptions(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Categoria' }), 'Lazer');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByText(/Sempre usar Lazer/)).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Palavra-chave' })).toHaveValue('jantar');
      await user.click(screen.getByRole('button', { name: 'Criar regra' }));
      await waitFor(async () => expect((await db.transactions.get('f'))?.category).toBe('Lazer'));
      expect(await db.rules.filter((r) => r.keyword === 'jantar' && r.category === 'Lazer').count()).toBe(1);
      expect(await db.transactions.get('a')).toMatchObject({ category: 'Lazer', categorySource: 'manual' });
    });

    it('"Agora não" skips the rule', async () => {
      const { user } = show();
      await user.click(await screen.findByText('jantar sushi'));
      await user.selectOptions(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Categoria' }), 'Lazer');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      const rulesBefore = await db.rules.count();
      await user.click(await screen.findByRole('button', { name: 'Agora não' }));
      expect(await db.rules.count()).toBe(rulesBefore);
    });

    it('"Desfazer" after an edit restores the previous version', async () => {
      const { user } = show();
      await user.click(await screen.findByText('Farmácia'));
      const amount = screen.getByDisplayValue('12');
      await user.clear(amount);
      await user.type(amount, '99');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      await undoToast(user, 'Lançamento atualizado');
      await waitFor(async () => expect((await db.transactions.get('b'))?.amount).toBe(12));
    });

    it('deleting an entry made in the app removes it; undo brings it back', async () => {
      const { user } = show();
      await user.click(await screen.findByText('Farmácia'));
      await user.click(screen.getByRole('button', { name: 'Excluir' }));
      await waitFor(async () => expect(await db.transactions.get('b')).toBeUndefined());
      await undoToast(user, 'Farmácia excluído');
      await waitFor(async () => expect(await db.transactions.get('b')).toBeDefined());
    });

    it('deleting an imported entry keeps it soft-deleted, so export can clear its cell', async () => {
      const { user } = show();
      await user.click(await screen.findByText('Aluguel'));
      expect(screen.getByText('Veio da planilha, célula K11.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Excluir' }));
      await waitFor(async () => expect((await db.transactions.get('c'))?.deleted).toBe(true));
      expect((await liveTxs()).map((t) => t.id)).not.toContain('c');
      await waitFor(() => expect(screen.queryByText('Aluguel')).not.toBeInTheDocument());
    });

    it('the paid flag can still be changed in the panel', async () => {
      const { user } = show();
      await user.click(await screen.findByText('Aluguel'));
      await user.click(screen.getByRole('checkbox', { name: 'Pago' }));
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(async () => expect((await db.transactions.get('c'))?.paid).toBe(true));
    });
  });
});
