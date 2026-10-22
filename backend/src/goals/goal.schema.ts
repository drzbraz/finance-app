import type { GoalContribution } from '@finance/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
class ContributionRecord implements GoalContribution {
  @Prop({ type: String }) date!: string;
  @Prop({ type: Number }) amount!: number;
}

@Schema({ collection: 'goals', versionKey: false })
export class GoalRecord {
  @Prop({ type: String }) _id!: string;
  @Prop({ type: String }) name!: string;
  @Prop({ type: Number }) target!: number;
  @Prop({ type: String, enum: ['EUR', 'BRL'] }) currency!: 'EUR' | 'BRL';
  @Prop({ type: String }) targetDate?: string;
  @Prop({ type: String, enum: ['patrimony', 'manual'] }) source!: 'patrimony' | 'manual';
  @Prop({ type: [SchemaFactory.createForClass(ContributionRecord)], default: [] }) contributions!: GoalContribution[];
  @Prop({ type: String }) createdAt!: string;
}

export const GoalSchema = SchemaFactory.createForClass(GoalRecord);
