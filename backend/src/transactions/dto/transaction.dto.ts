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
import { CELL_ADDRESS, ISO_DATE } from '../../common/dto/patterns.js';

export class CellRefDto implements CellRef {
  @IsString() sheet!: string;
  @Matches(CELL_ADDRESS) cell!: string;
}

export class SplitDto implements Split {
  @IsInt() @Min(2) @Max(100) people!: number;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) total!: number;
}

export class TransactionDto implements Transaction {
  @IsString() @IsNotEmpty() id!: string;
  @IsInt() year!: number;
  @IsInt() @Min(1) @Max(12) month!: number;
  @IsOptional() @Matches(ISO_DATE) date?: string;
  @IsString() description!: string;
  @IsNumber({ allowNaN: false, allowInfinity: false }) amount!: number;
  @IsIn(TX_TYPES) type!: TxType;
  @IsString() category!: string;
  @IsIn(['auto', 'manual']) categorySource!: 'auto' | 'manual';
  @IsArray() @IsString({ each: true }) tags!: string[];
  @IsBoolean() paid!: boolean;
  @IsOptional() @IsString() subgroup?: string;
  @IsOptional() @ValidateNested() @Type(() => CellRefDto) source?: CellRefDto;
  @IsOptional() @IsString() noteHeader?: string;
  @IsOptional() @IsBoolean() deleted?: boolean;
  @IsOptional() @IsString() updatedAt?: string;
  @IsOptional() @IsIn(['start-month']) origin?: 'start-month';
  @IsOptional() @ValidateNested() @Type(() => SplitDto) split?: SplitDto;
}

export class TransactionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionDto)
  transactions!: TransactionDto[];
}
