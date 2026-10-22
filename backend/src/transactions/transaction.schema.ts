import { TX_TYPES, type CellRef, type TxType } from '@finance/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
class CellRefRecord implements CellRef {
  @Prop({ type: String }) sheet!: string;
  @Prop({ type: String }) cell!: string;
}

/** A transaction; `_id` is its id ("imp-2026-B15" for imported cells). */
@Schema({ collection: 'transactions', versionKey: false })
export class TransactionRecord {
  @Prop({ type: String }) _id!: string;
  @Prop({ type: Number, index: true }) year!: number;
  @Prop({ type: Number }) month!: number;
  @Prop({ type: String }) date?: string;
  @Prop({ type: String }) description!: string;
  @Prop({ type: Number }) amount!: number;
  @Prop({ type: String, enum: TX_TYPES }) type!: TxType;
  @Prop({ type: String }) category!: string;
  @Prop({ type: String, enum: ['auto', 'manual'] }) categorySource!: 'auto' | 'manual';
  @Prop({ type: [String], default: [] }) tags!: string[];
  @Prop({ type: Boolean }) paid!: boolean;
  @Prop({ type: String }) subgroup?: string;
  @Prop({ type: SchemaFactory.createForClass(CellRefRecord) }) source?: CellRef;
  @Prop({ type: String }) noteHeader?: string;
  @Prop({ type: Boolean }) deleted?: boolean;
  @Prop({ type: String }) updatedAt?: string;
  @Prop({ type: String, enum: ['start-month'] }) origin?: 'start-month';
}

export const TransactionSchema = SchemaFactory.createForClass(TransactionRecord);
