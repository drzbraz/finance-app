import { fireEvent } from '@testing-library/react';
import { db } from '../../src/db/schema';
import Bills from '../../src/pages/Bills';
import { freezeToday, liveTxs, resetDb, screen, seed, setup, undoToast, waitFor, within } from './render';

// Today is 22/10/2026. September is fully recorded; October only has the rent, still pending.
const SEPT = [
  { id: 's-rent', month: 9, description: 'Aluguel', amount: 700, type: 'fixed' as const, category: 'Casa' },
  { id: 's-netflix', month: 9, description: 'Netflix', amount: 15, type: 'fixed' as const, category: 'Assinaturas' },
  { id: 's-salary', month: 9, description: 'Salário', amount: 2200, type: 'income' as const, category: 'Receita' },
  { id: 's-etf', month: 9, description: 'ETF', amount: 300, type: 'investment' as const, category: 'Investimento' },
];
const OCT = [{ id: 'o-rent', month: 10, date: '2026-10-05', description: 'Aluguel', amount: 700, type: 'fixed' as const, category: 'Casa', paid: false, source: { sheet: 'Listas de itens', cell: 'K11' } }];
const RECURRING = [
  { key: 'fixed|Aluguel', type: 'fixed' as const, description: 'Aluguel', dueDay: 5, active: true },
  { key: 'fixed|Netflix', type: 'fixed' as const, description: 'Netflix', dueDay: 25, active: true },
  { key: 'income|Salário', type: 'income' as const, description: 'Salário', dueDay: 30, active: true },
];

const section = (title: RegExp) => screen.getByRole('heading', { name: title }).closest('section')!;
const octTxs = async () => (await liveTxs()).filter((t) => t.month === 10);

describe('Contas', () => {
  beforeEach(async () => {
    freezeToday();
    await resetDb();
    await seed({ txs: [...SEPT, ...OCT], recurring: RECURRING });
  });
  afterEach(() => vi.useRealTimers());

  /** Renders and waits until the stored due days are in (bills move between sections then). */
  const show = (month = 10) => {
    const r = setup(<Bills year={2026} month={month} />);
    const ready = async () => {
      await screen.findByRole('heading', { name: month === 10 ? /Atrasadas/ : /./ });
      await screen.findByText(/de 4 feitas/);
    };
    return { ...r, ready };
  };

  it('sorts the month into Atrasadas / Próximos 7 dias / Mais tarde with a summary', async () => {
    show();
    expect(await screen.findByRole('heading', { name: /Atrasadas · 1/ })).toBeInTheDocument();
    expect(within(section(/Atrasadas/)).getByText('Aluguel')).toBeInTheDocument();
    expect(within(section(/Próximos 7 dias/)).getByText('Netflix')).toBeInTheDocument();
    const later = section(/Mais tarde/);
    expect(within(later).getByText('Salário')).toBeInTheDocument();
    expect(within(later).getByText('ETF')).toBeInTheDocument();
    expect(within(later).getAllByText(/ainda não lançado/)).toHaveLength(2);
    expect(screen.getByText(/0 de 4 feitas · 1015,00\s€ a pagar · 2200,00\s€ a receber/)).toBeInTheDocument();
  });

  it('one click marks a recorded bill paid; undo makes it pending again', async () => {
    const { user, ready } = show();
    await ready();
    await user.click(await screen.findByRole('checkbox', { name: 'Aluguel pago' }));
    await waitFor(async () => expect((await db.transactions.get('o-rent'))?.paid).toBe(true));
    expect(await screen.findByRole('heading', { name: /Pagas e recebidas · 1/ })).toBeInTheDocument();
    await undoToast(user, 'Aluguel: pago');
    await waitFor(async () => expect((await db.transactions.get('o-rent'))?.paid).toBe(false));
  });

  it('checking a bill not recorded yet records it, paid, with the expected amount', async () => {
    const { user, ready } = show();
    await ready();
    await user.click(await screen.findByRole('checkbox', { name: 'Netflix pago' }));
    await waitFor(async () => expect((await octTxs()).find((t) => t.description === 'Netflix')).toMatchObject({ amount: 15, paid: true, type: 'fixed', category: 'Assinaturas', date: '2026-10-25' }));
    await undoToast(user, /Netflix registrado/);
    await waitFor(async () => expect((await octTxs()).find((t) => t.description === 'Netflix')).toBeUndefined());
  });

  it('a past month with unpaid bills shows them as overdue', async () => {
    await db.transactions.update('s-netflix', { paid: false });
    show(9);
    expect(within(await screen.findByRole('heading', { name: /Atrasadas · 1/ }).then((h) => h.closest('section')!)).getByText('Netflix')).toBeInTheDocument();
  });

  describe('Iniciar mês', () => {
    it('creates the missing bills as pending and is idempotent', async () => {
      const { user, ready } = show();
      await ready();
      await user.click(await screen.findByRole('button', { name: 'Iniciar outubro (3)' }));
      await waitFor(async () => expect(await octTxs()).toHaveLength(4));
      const created = (await octTxs()).filter((t) => t.id !== 'o-rent');
      expect(created.map((t) => [t.description, t.amount, t.paid, t.origin]).sort()).toEqual([
        ['ETF', 300, false, 'start-month'],
        ['Netflix', 15, false, 'start-month'],
        ['Salário', 2200, false, 'start-month'],
      ]);
      expect(created.find((t) => t.description === 'Netflix')?.category).toBe('Assinaturas');
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Iniciar outubro/ })).not.toBeInTheDocument());
    });

    it('"Desfazer início" asks first, then removes only what is still pending', async () => {
      const { user, ready } = show();
      await ready();
      await user.click(await screen.findByRole('button', { name: 'Iniciar outubro (3)' }));
      // Wait for the new entries to be on screen before ticking one.
      await screen.findByRole('button', { name: /Desfazer início de outubro/ });
      await user.click(screen.getByRole('checkbox', { name: 'Salário recebido' }));
      await waitFor(async () => expect((await octTxs()).find((t) => t.description === 'Salário')?.paid).toBe(true));

      await user.click(screen.getByRole('button', { name: /Desfazer início de outubro/ }));
      const box = screen.getByText('Desfazer o início de outubro?').parentElement!;
      expect(within(box).getByText('Netflix')).toBeInTheDocument();
      expect(within(box).getByText('ETF')).toBeInTheDocument();
      expect(within(box).queryByText('Salário')).not.toBeInTheDocument();
      expect(within(box).queryByText('Aluguel')).not.toBeInTheDocument();

      await user.click(within(box).getByRole('button', { name: 'Desfazer início' }));
      await waitFor(async () => expect((await octTxs()).map((t) => t.description).sort()).toEqual(['Aluguel', 'Salário']));
      // And the undo of the undo puts them back.
      await undoToast(user, /Início de outubro desfeito: 2/);
      await waitFor(async () => expect(await octTxs()).toHaveLength(4));
    });

    it('after an export, undoing the start soft-deletes the entries so the next export clears their cells', async () => {
      await seed({ txs: [{ id: 'imp-2026-K14', month: 10, description: 'Netflix', amount: 15, type: 'fixed', category: 'Assinaturas', paid: false, origin: 'start-month', source: { sheet: 'Listas de itens', cell: 'K14' } }] });
      const { user, ready } = show();
      await ready();
      await user.click(await screen.findByRole('button', { name: /Desfazer início de outubro/ }));
      await user.click(screen.getByRole('button', { name: 'Desfazer início' }));
      await waitFor(async () => expect((await db.transactions.get('imp-2026-K14'))?.deleted).toBe(true));
    });

    it('"Cancelar" keeps everything', async () => {
      const { user, ready } = show();
      await ready();
      await user.click(await screen.findByRole('button', { name: 'Iniciar outubro (3)' }));
      await user.click(await screen.findByRole('button', { name: /Desfazer início de outubro/ }));
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(await octTxs()).toHaveLength(4);
    });
  });

  describe('Nova conta / editar / excluir', () => {
    it('adds a bill and records it in the month as pending', async () => {
      const { user, ready } = show();
      await ready();
      await user.click(await screen.findByRole('button', { name: '+ Nova conta' }));
      await user.type(screen.getByLabelText('Nome'), 'Academia');
      await user.type(screen.getByLabelText('Valor por mês (€)'), '39,90');
      await user.type(screen.getByLabelText('Dia de vencimento'), '28');
      await user.click(screen.getByRole('button', { name: 'Adicionar conta' }));
      await waitFor(async () => expect(await db.recurring.get('fixed|Academia')).toMatchObject({ expectedAmount: 39.9, dueDay: 28, active: true }));
      expect((await octTxs()).find((t) => t.description === 'Academia')).toMatchObject({ amount: 39.9, paid: false, date: '2026-10-28', category: 'Saúde' });
      expect(await screen.findByText('Academia')).toBeInTheDocument();
    });

    it('can add a bill without recording it this month', async () => {
      const { user, ready } = show();
      await ready();
      await user.click(await screen.findByRole('button', { name: '+ Nova conta' }));
      await user.type(screen.getByLabelText('Nome'), 'Seguro');
      await user.type(screen.getByLabelText('Valor por mês (€)'), '20');
      await user.click(screen.getByRole('checkbox', { name: /Lançar já em outubro/ }));
      await user.click(screen.getByRole('button', { name: 'Adicionar conta' }));
      await waitFor(async () => expect(await db.recurring.get('fixed|Seguro')).toBeDefined());
      expect((await octTxs()).find((t) => t.description === 'Seguro')).toBeUndefined();
    });

    it('validates name, amount, due day and duplicates', async () => {
      const { user, ready } = show();
      await ready();
      await user.click(await screen.findByRole('button', { name: '+ Nova conta' }));
      const submit = screen.getByRole('button', { name: 'Adicionar conta' });
      await user.click(submit);
      expect(screen.getByRole('alert')).toHaveTextContent('Dê um nome à conta.');
      await user.type(screen.getByLabelText('Nome'), 'Netflix');
      await user.click(submit);
      expect(screen.getByRole('alert')).toHaveTextContent('Informe o valor');
      await user.type(screen.getByLabelText('Valor por mês (€)'), '15');
      fireEvent.change(screen.getByLabelText('Dia de vencimento'), { target: { value: '40' } });
      // The field's own min/max stops the form before the app's check.
      expect(screen.getByLabelText('Dia de vencimento')).toBeInvalid();
      await user.click(submit);
      expect(await db.recurring.get('fixed|Netflix')).toMatchObject({ dueDay: 25 });
      await user.clear(screen.getByLabelText('Dia de vencimento'));
      await user.click(submit);
      expect(screen.getByRole('alert')).toHaveTextContent('Já existe uma conta com esse nome.');
    });

    it('renaming a bill renames its entries of the year', async () => {
      const { user, ready } = show();
      await ready();
      await user.click(await screen.findByRole('button', { name: 'Editar Netflix' }));
      const name = screen.getByLabelText('Nome');
      await user.clear(name);
      await user.type(name, 'Netflix Premium');
      expect(screen.getByText(/passam a se chamar “Netflix Premium”/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(async () => expect((await db.transactions.get('s-netflix'))?.description).toBe('Netflix Premium'));
      expect((await db.recurring.get('fixed|Netflix'))?.removed).toBe(true);
      expect(await db.recurring.get('fixed|Netflix Premium')).toMatchObject({ dueDay: 25, active: true });
      expect(await screen.findByText('Netflix Premium')).toBeInTheDocument();
      expect(screen.queryByText('Netflix')).not.toBeInTheDocument();
    });

    it("changes this month's amount only (e.g. a different energy bill)", async () => {
      const { user, ready } = show();
      await ready();
      await user.click(await screen.findByRole('button', { name: 'Editar Aluguel' }));
      const month = screen.getByLabelText(/Valor lançado em outubro/);
      await user.clear(month);
      await user.type(month, '720');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(async () => expect((await db.transactions.get('o-rent'))?.amount).toBe(720));
      expect((await db.transactions.get('s-rent'))?.amount).toBe(700);
      expect((await db.recurring.get('fixed|Aluguel'))?.expectedAmount).toBe(700);
    });

    it('deactivating moves it to "Inativas"; "Reativar" brings it back', async () => {
      const { user, ready } = show();
      await ready();
      await user.click(await screen.findByRole('button', { name: 'Editar Netflix' }));
      await user.click(screen.getByRole('checkbox', { name: /Ativa/ }));
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByText('Inativas · 1')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: 'Netflix pago' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Iniciar outubro (2)' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Reativar' }));
      expect(await screen.findByRole('checkbox', { name: 'Netflix pago' })).toBeInTheDocument();
    });

    it('deleting a bill asks first, drops its pending entry, keeps the history, and can be undone', async () => {
      const { user, ready } = show();
      await ready();
      await user.click(await screen.findByRole('button', { name: 'Editar Aluguel' }));
      await user.click(screen.getByRole('button', { name: 'Excluir' }));
      expect(screen.getByText('Remover “Aluguel” das contas?')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Apagar também o lançamento pendente/ })).toBeChecked();
      await user.click(screen.getByRole('button', { name: 'Remover conta' }));
      // Imported from the sheet: soft-deleted, so the export clears its cell.
      await waitFor(async () => expect((await db.transactions.get('o-rent'))?.deleted).toBe(true));
      expect(await db.transactions.get('s-rent')).toBeDefined();
      expect((await db.recurring.get('fixed|Aluguel'))?.removed).toBe(true);
      await waitFor(() => expect(screen.queryByText('Aluguel')).not.toBeInTheDocument());

      await undoToast(user, 'Aluguel removida das contas');
      await waitFor(async () => expect((await db.transactions.get('o-rent'))?.deleted).toBeFalsy());
      expect(await screen.findByText('Aluguel')).toBeInTheDocument();
    });
  });

  describe('Limites de gasto', () => {
    beforeEach(() => seed({ txs: [{ id: 'fun', month: 10, description: 'cinema', amount: 50, category: 'Lazer' }] }));

    it('sets a Lazer limit and shows what is left, per day until the month ends', async () => {
      const { user, ready } = show();
      await ready();
      const card = (await screen.findByRole('heading', { name: 'Limites de gasto' })).closest('section')!;
      expect(within(card).getByRole('combobox', { name: 'Categoria' })).toHaveValue('Lazer');
      await user.type(within(card).getByRole('textbox', { name: 'Limite por mês' }), '200');
      await user.click(within(card).getByRole('button', { name: 'Definir limite' }));
      await waitFor(async () => expect(await db.budgets.get('Lazer')).toEqual({ category: 'Lazer', monthlyLimit: 200 }));
      expect(await within(card).findByText(/^150,00\s€$/)).toBeInTheDocument();
      // 22 → 31 October = 10 days including today.
      expect(within(card).getByText(/ainda pode gastar · gasto 50,00\s€ · ≈ 15,00\s€\/dia por 10 dia\(s\)/)).toBeInTheDocument();
    });

    it('shows when the limit is blown, and 0 removes it', async () => {
      await seed({ budgets: [{ category: 'Lazer', monthlyLimit: 40 }] });
      const { user, ready } = show();
      await ready();
      const card = (await screen.findByRole('heading', { name: 'Limites de gasto' })).closest('section')!;
      expect(await within(card).findByText('✕ Estourou o limite')).toBeInTheDocument();
      expect(within(card).getByText(/^−10,00\s€$/)).toBeInTheDocument();
      await user.click(within(card).getByRole('button', { name: /limite 40,00/ }));
      const input = within(card).getByRole('textbox', { name: 'Limite de Lazer' });
      await user.clear(input);
      await user.type(input, '0{Enter}');
      await waitFor(async () => expect(await db.budgets.get('Lazer')).toBeUndefined());
    });

    it('the button stays disabled without an amount', async () => {
      show();
      const card = (await screen.findByRole('heading', { name: 'Limites de gasto' })).closest('section')!;
      expect(within(card).getByRole('button', { name: 'Definir limite' })).toBeDisabled();
    });
  });
});
