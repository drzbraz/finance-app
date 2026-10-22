import { buildStatement, FIXTURE_MOVEMENTS } from '../../testing/statement.fixture.js';
import { parseActivoBank, UnknownStatementError } from './activobank.js';
import { groupLines, readPdfLines } from './pdf-lines.js';
import { readStatement } from './read-statement.js';

describe('ActivoBank statement', () => {
  it('reads every movement with its date, column and the balance check', async () => {
    const statement = await readStatement(await buildStatement());
    expect(statement).toMatchObject({ bank: 'ActivoBank', holder: 'ANA TESTE SILVA', from: '2026-09-01', to: '2026-09-30' });
    expect(statement.entries).toHaveLength(FIXTURE_MOVEMENTS.length);
    expect(statement.entries[0]).toEqual({ date: '2026-09-01', raw: 'DD GracieBarraRio 82849480274 PT67120072', amount: 80, direction: 'debit', balanceOk: true });
    expect(statement.entries.every((e) => e.balanceOk)).toBe(true);
  });

  it('joins thousands printed apart ("2" "500.00") and tells credits from debits by column', async () => {
    const { entries } = await readStatement(await buildStatement());
    expect(entries.find((e) => e.raw.startsWith('TRF P/'))).toMatchObject({ amount: 2500, direction: 'debit' });
    expect(entries.find((e) => e.raw === 'Mangopay')).toMatchObject({ amount: 8.8, direction: 'credit' });
    expect(entries.find((e) => e.raw.startsWith('TRF. P/O'))).toMatchObject({ amount: 1540, direction: 'credit' });
  });

  it('keeps an exchange rate inside the description out of the amounts', async () => {
    const { entries } = await readStatement(await buildStatement());
    expect(entries.find((e) => e.raw.includes('Google'))).toMatchObject({ raw: 'COMPRA 1254 Google Chrome 65 USD TC 0.8620000', amount: 4.31 });
  });

  it('flags lines that do not add up with the printed balance', async () => {
    const { entries } = await readStatement(await buildStatement({ wrongBalanceAt: 1 }));
    // A wrong balance breaks its own line and the next one, which starts from it.
    expect(entries.map((e) => e.balanceOk)).toEqual([true, false, false, ...Array(FIXTURE_MOVEMENTS.length - 3).fill(true)]);
  });

  it('puts January lines of a December–January statement in the next year', async () => {
    const movements = [
      { date: '12.30', text: 'COMPRA 1254 LIDL', amount: 10 },
      { date: '1.02', text: 'COMPRA 1254 LIDL', amount: 5 },
    ];
    const { entries } = await readStatement(await buildStatement({ from: '2026/12/15', to: '2027/01/14', movements }));
    expect(entries.map((e) => e.date)).toEqual(['2026-12-30', '2027-01-02']);
  });

  it('refuses statements of other banks, PDFs without the table and files that are not PDFs', async () => {
    await expect(readStatement(await buildStatement({ bank: 'Outro Banco' }))).rejects.toThrow(/not supported/);
    const lines = await readPdfLines(await buildStatement());
    expect(() => parseActivoBank(lines.filter((l) => !l.text.startsWith('EXTRATO DE')))).toThrow(UnknownStatementError);
    expect(() => parseActivoBank(lines.filter((l) => !l.text.includes('DEBITO')))).toThrow(/table/);
    await expect(readStatement(Buffer.from('not a pdf'))).rejects.toThrow();
  });

  it('groups text 1–2pt apart into one line, left to right', () => {
    const lines = groupLines(1, [
      { text: 'b', x: 50, right: 55, y: 100 },
      { text: 'a', x: 10, right: 15, y: 101 },
      { text: 'c', x: 10, right: 15, y: 90 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['a b', 'c']);
  });
});
