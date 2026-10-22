import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** A category's monthly spending limit; `_id` is the category name. */
@Schema({ collection: 'budgets', versionKey: false })
export class BudgetRecord {
  @Prop({ type: String }) _id!: string;
  @Prop({ type: Number }) monthlyLimit!: number;
}

export const BudgetSchema = SchemaFactory.createForClass(BudgetRecord);
