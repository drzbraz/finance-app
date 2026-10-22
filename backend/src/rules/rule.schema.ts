import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'rules', versionKey: false })
export class RuleRecord {
  @Prop({ type: String }) _id!: string;
  @Prop({ type: String }) keyword!: string;
  @Prop({ type: String, index: true }) category!: string;
  @Prop({ type: [String], default: undefined }) tags?: string[];
  @Prop({ type: Boolean }) exact?: boolean;
  @Prop({ type: Number }) priority!: number;
}

export const RuleSchema = SchemaFactory.createForClass(RuleRecord);
