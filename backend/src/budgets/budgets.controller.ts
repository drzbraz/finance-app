import type { Budget } from '@finance/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { BudgetsDto, CategoriesDto, MonthlyLimitDto } from './dto/budget.dto.js';
import { BudgetsService } from './budgets.service.js';

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(): Promise<Budget[]> {
    return this.budgets.list();
  }

  @Put(':category')
  @HttpCode(HttpStatus.NO_CONTENT)
  save(@Param('category') category: string, @Body() body: MonthlyLimitDto): Promise<void> {
    return this.budgets.save({ category, monthlyLimit: body.monthlyLimit });
  }

  @Post('bulk')
  @HttpCode(HttpStatus.NO_CONTENT)
  saveMany(@Body() body: BudgetsDto): Promise<void> {
    return this.budgets.saveMany(body.budgets);
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMany(@Body() body: CategoriesDto): Promise<void> {
    return this.budgets.removeMany(body.categories);
  }
}
