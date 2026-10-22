import type { CategoryRule } from '@finance/shared';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RuleDto implements CategoryRule {
  @IsString() @IsNotEmpty() id!: string;
  @IsString() @IsNotEmpty() keyword!: string;
  @IsString() @IsNotEmpty() category!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() exact?: boolean;
  @IsInt() priority!: number;
}
