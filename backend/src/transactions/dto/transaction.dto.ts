import { TX_TYPES, type CellRef, type Split, type Transaction, type TxType } from '@finance/shared';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CELL_ADDRESS, ISO_DATE, ISO_TIMESTAMP } from '../../common/dto/patterns.js';
import { MAX_YEAR } from '../../common/year.pipe.js';

/** Far above any real entry; keeps a typo (an extra few zeros) out of every total. */
const MAX_AMOUNT = 10_000_000;

export class CellRefDto implements CellRef {
  @IsString() sheet!: string;
  @Matches(CELL_ADDRESS) cell!: string;
}

export class SplitDto implements Split {
  @IsInt() @Min(2) @Max(100) people!: number;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(MAX_AMOUNT) total!: number;
  @IsOptional() @Matches(ISO_DATE) receivedOn?: string;
}

export class TransactionDto implements Transaction {
  @IsString() @IsNotEmpty() id!: string;
  // 0 = a sheet read before its year was known; older backups may carry it.
  @IsInt() @Min(0) @Max(MAX_YEAR) year!: number;
  @IsInt() @Min(1) @Max(12) month!: number;
  @IsOptional() @Matches(ISO_DATE) date?: string;
  @IsString() description!: string;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-MAX_AMOUNT) @Max(MAX_AMOUNT) amount!: number;
  @IsIn(TX_TYPES) type!: TxType;
  @IsString() category!: string;
  @IsIn(['auto', 'manual']) categorySource!: 'auto' | 'manual';
  @IsArray() @IsString({ each: true }) tags!: string[];
  @IsBoolean() paid!: boolean;
  @IsOptional() @IsString() subgroup?: string;
  @IsOptional() @ValidateNested() @Type(() => CellRefDto) source?: CellRefDto;
  @IsOptional() @IsString() noteHeader?: string;
  @IsOptional() @IsBoolean() deleted?: boolean;
  @IsOptional() @Matches(ISO_TIMESTAMP) updatedAt?: string;
  @IsOptional() @IsIn(['start-month']) origin?: 'start-month';
  @IsOptional() @ValidateNested() @Type(() => SplitDto) split?: SplitDto;
}

export class TransactionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionDto)
  transactions!: TransactionDto[];
}
