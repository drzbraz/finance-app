import { defaultRules } from '@finance/shared';
import { UnprocessableEntityException } from '@nestjs/common';
import type { Mocked } from 'vitest';
import type { RulesRepository } from '../rules/rules.repository.js';
import { tx } from '../testing/factories.js';
import { mockOf } from '../testing/mocks.js';
import { buildStatement } from '../testing/statement.fixture.js';
import type { TransactionsRepository } from '../transactions/transactions.repository.js';
import { StatementImportService } from './statement-import.service.js';

describe('StatementImportService', () => {
  let transactions: Mocked<TransactionsRepository>;
  let rules: Mocked<RulesRepository>;
  let service: StatementImportService;

  beforeEach(() => {
    transactions = mockOf<TransactionsRepository>();
    rules = mockOf<RulesRepository>();
    service = new StatementImportService(transactions, rules);
    rules.findAll.mockResolvedValue(defaultRules());
    transactions.findLiveByYear.mockResolvedValue([]);
  });

  it('reviews the statement against the rules and the live entries of its years, saving nothing', async () => {
    transactions.findLiveByYear.mockResolvedValue([tx({ id: 'jiu', month: 9, amount: 80, type: 'fixed', category: 'Saúde' })]);
    const preview = await service.preview({ fileName: 'Extrato.pdf', data: await buildStatement() });
    expect(preview).toMatchObject({ bank: 'ActivoBank', fileName: 'Extrato.pdf', from: '2026-09-01', to: '2026-09-30' });
    expect(preview.rows[0]).toMatchObject({ doubts: ['duplicate'], match: { id: 'jiu' } });
    expect(transactions.findLiveByYear).toHaveBeenCalledWith(2026);
    expect(transactions.saveMany).not.toHaveBeenCalled();
  });

  it('looks at both years of a statement across New Year', async () => {
    await service.preview({ fileName: 'x.pdf', data: await buildStatement({ from: '2026/12/15', to: '2027/01/14', movements: [] }) });
    expect(transactions.findLiveByYear.mock.calls).toEqual([[2026], [2027]]);
  });

  it('turns an unreadable or unknown statement into a 422', async () => {
    await expect(service.preview({ fileName: 'x.pdf', data: Buffer.from('nope') })).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(service.preview({ fileName: 'x.pdf', data: await buildStatement({ bank: 'Outro' }) })).rejects.toThrow(/not supported/);
  });
});
