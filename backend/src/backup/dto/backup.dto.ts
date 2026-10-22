import type { Backup, BackupWorkbook, Settings } from '@finance/shared';
import { Type } from 'class-transformer';
import { Equals, IsArray, IsBase64, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { BudgetDto } from '../../budgets/dto/budget.dto.js';
import { GoalDto } from '../../goals/dto/goal.dto.js';
import { RecurringItemDto } from '../../recurring/dto/recurring.dto.js';
import { RuleDto } from '../../rules/dto/rule.dto.js';
import { UpdateSettingsDto } from '../../settings/dto/update-settings.dto.js';
import { TransactionDto } from '../../transactions/dto/transaction.dto.js';

export class BackupWorkbookDto implements BackupWorkbook {
  @IsInt() year!: number;
  @IsString() fileName!: string;
  @IsString() importedAt!: string;
  @IsBase64() dataBase64!: string;
}

/** A backup file as uploaded; settings may be partial (older versions had fewer fields). */
export class BackupDto implements Omit<Backup, 'settings'> {
  @Equals('finance-app', { message: 'Not a finance-app backup' }) app!: 'finance-app';
  @IsIn([1, 2], { message: 'Unsupported backup version' }) version!: 1 | 2;
  @IsString() exportedAt!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TransactionDto) transactions!: TransactionDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => RuleDto) rules!: RuleDto[];
  @ValidateNested() @Type(() => UpdateSettingsDto) settings!: Partial<Settings>;
  @IsArray() @ValidateNested({ each: true }) @Type(() => BackupWorkbookDto) workbooks!: BackupWorkbookDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetDto) budgets?: BudgetDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GoalDto) goals?: GoalDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RecurringItemDto) recurring?: RecurringItemDto[];
}
