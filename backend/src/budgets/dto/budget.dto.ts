import type { Budget } from '@finance/shared';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';

export class MonthlyLimitDto {
  @IsNumber({ allowNaN: false, allowInfinity: false }) monthlyLimit!: number;
}

export class BudgetDto extends MonthlyLimitDto implements Budget {
  @IsString() @IsNotEmpty() category!: string;
}

export class BudgetsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetDto) budgets!: BudgetDto[];
}

export class CategoriesDto {
  @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) categories!: string[];
}
