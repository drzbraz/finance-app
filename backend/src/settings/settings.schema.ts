import type { ThemePref } from '@finance/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** The single settings document (`_id: "settings"`). `minimize: false` keeps an empty lastExportAt. */
@Schema({ collection: 'settings', versionKey: false, minimize: false })
export class SettingsRecord {
  @Prop({ type: String }) _id!: string;
  @Prop({ type: Number }) eurBrlRate!: number;
  @Prop({ type: Number }) goalBRL!: number;
  @Prop({ type: Number }) reserveEUR!: number;
  @Prop({ type: Number }) patrimonyBR!: number;
  @Prop({ type: Number }) patrimonyEU!: number;
  @Prop({ type: Number }) savingsRateTarget!: number;
  @Prop({ type: String, enum: ['system', 'light', 'dark'] }) theme!: ThemePref;
  @Prop({ type: Object, default: {} }) lastExportAt!: Record<string, string>;
}

export const SettingsSchema = SchemaFactory.createForClass(SettingsRecord);
