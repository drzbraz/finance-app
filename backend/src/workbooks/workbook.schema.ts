import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** The year's baseline .xlsx (the last import or export); `_id` is the year. */
@Schema({ collection: 'workbooks', versionKey: false })
export class WorkbookRecord {
  @Prop({ type: Number }) _id!: number;
  @Prop({ type: String }) fileName!: string;
  @Prop({ type: String }) importedAt!: string;
  @Prop({ type: Buffer }) data!: Buffer;
}

export const WorkbookSchema = SchemaFactory.createForClass(WorkbookRecord);
