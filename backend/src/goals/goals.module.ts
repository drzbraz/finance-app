import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GoalRecord, GoalSchema } from './goal.schema.js';
import { GoalsController } from './goals.controller.js';
import { GoalsRepository } from './goals.repository.js';
import { GoalsService } from './goals.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: GoalRecord.name, schema: GoalSchema }])],
  controllers: [GoalsController],
  providers: [GoalsRepository, GoalsService],
  exports: [GoalsRepository, GoalsService],
})
export class GoalsModule {}
