import type { StatementPreview } from '@finance/shared';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { RulesRepository } from '../rules/rules.repository.js';
import { TransactionsRepository } from '../transactions/transactions.repository.js';
import type { ParsedStatement } from './domain/activobank.js';
import { readStatement } from './domain/read-statement.js';
import { reviewStatement } from './domain/review.js';
import type { UploadedStatement } from './uploaded-statement.js';

@Injectable()
export class StatementImportService {
  constructor(
    private readonly transactions: TransactionsRepository,
    private readonly rules: RulesRepository,
  ) {}

  /**
   * The statement's lines as the entries they would become, with what is uncertain about each.
   * Nothing is saved: the app records the lines the user keeps through the transactions API.
   */
  async preview(file: UploadedStatement): Promise<StatementPreview> {
    const statement = await this.read(file);
    const years = [...new Set([statement.from, statement.to].map((d) => Number(d.slice(0, 4))))];
    const [rules, ...byYear] = await Promise.all([this.rules.findAll(), ...years.map((y) => this.transactions.findLiveByYear(y))]);
    const rows = reviewStatement(statement, rules, byYear.flat());
    return { bank: statement.bank, fileName: file.fileName, from: statement.from, to: statement.to, rows };
  }

  private async read(file: UploadedStatement): Promise<ParsedStatement> {
    try {
      return await readStatement(file.data);
    } catch (error) {
      throw new UnprocessableEntityException(`Could not read the statement: ${(error as Error).message}`);
    }
  }
}
