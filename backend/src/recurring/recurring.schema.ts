import { TX_TYPES, type TxType } from '@finance/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** A bill or income line; `_id` is its checklist key, "type|description". */
@Schema({ collection: 'recurring', versionKey: false })
export class RecurringRecord {
  @Prop({ type: String }) _id!: string;
  @Prop({ type: String, enum: TX_TYPES }) type!: TxType;
  @Prop({ type: String }) description!: string;
  @Prop({ type: Number }) dueDay?: number;
  @Prop({ type: Number }) expectedAmount?: number;
  @Prop({ type: Boolean }) active!: boolean;
  @Prop({ type: Boolean }) removed?: boolean;
}

export const RecurringSchema = SchemaFactory.createForClass(RecurringRecord);
