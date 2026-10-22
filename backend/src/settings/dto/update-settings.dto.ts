import type { ThemePref } from '@finance/shared';
import { IsIn, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import type { SettingsPatch } from '../settings.service.js';

export class UpdateSettingsDto implements SettingsPatch {
  @IsOptional() @IsNumber() @Min(0) eurBrlRate?: number;
  @IsOptional() @IsNumber() @Min(0) goalBRL?: number;
  @IsOptional() @IsNumber() reserveEUR?: number;
  @IsOptional() @IsNumber() patrimonyBR?: number;
  @IsOptional() @IsNumber() patrimonyEU?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) savingsRateTarget?: number;
  @IsOptional() @IsIn(['system', 'light', 'dark']) theme?: ThemePref;
  @IsOptional() @IsObject() lastExportAt?: Record<number, string>;
}
