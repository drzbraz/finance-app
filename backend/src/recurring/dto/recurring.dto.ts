import { TX_TYPES, type RecurringItem, type RecurringRename, type TxType } from '@finance/shared';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { TransactionDto } from '../../transactions/dto/transaction.dto.js';

export class RecurringItemDto implements RecurringItem {
  @IsString() @IsNotEmpty() key!: string;
  @IsIn(TX_TYPES) type!: TxType;
  @IsString() description!: string;
  @IsOptional() @IsInt() @Min(1) @Max(31) dueDay?: number;
  @IsOptional() @IsNumber() expectedAmount?: number;
  @IsBoolean() active!: boolean;
  @IsOptional() @IsBoolean() optional?: boolean;
  @IsOptional() @IsBoolean() removed?: boolean;
}

export class RecurringRenameDto implements RecurringRename {
  @IsOptional() @ValidateNested() @Type(() => RecurringItemDto) previous!: RecurringItemDto | null;
  @ValidateNested() @Type(() => RecurringItemDto) next!: RecurringItemDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TransactionDto) renamed!: TransactionDto[];
}
