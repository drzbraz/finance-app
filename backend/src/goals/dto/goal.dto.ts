import type { Goal, GoalContribution } from '@finance/shared';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { ISO_DATE } from '../../common/dto/patterns.js';

export class ContributionDto implements GoalContribution {
  @Matches(ISO_DATE) date!: string;
  @IsNumber({ allowNaN: false, allowInfinity: false }) amount!: number;
}

export class GoalDto implements Goal {
  @IsString() @IsNotEmpty() id!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsNumber() @Min(0) target!: number;
  @IsIn(['EUR', 'BRL']) currency!: 'EUR' | 'BRL';
  @IsOptional() @Matches(ISO_DATE) targetDate?: string;
  @IsIn(['patrimony', 'manual']) source!: 'patrimony' | 'manual';
  @IsArray() @ValidateNested({ each: true }) @Type(() => ContributionDto) contributions!: ContributionDto[];
  @IsString() createdAt!: string;
}
