import type { Goal } from '@finance/shared';
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { GoalDto } from './dto/goal.dto.js';
import { GoalsService } from './goals.service.js';

@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  list(): Promise<Goal[]> {
    return this.goals.list();
  }

  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  save(@Param('id') id: string, @Body() goal: GoalDto): Promise<void> {
    if (goal.id !== id) throw new BadRequestException('The body id does not match the URL');
    return this.goals.save(goal);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.goals.remove(id);
  }
}
