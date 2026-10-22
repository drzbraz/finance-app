import type { AddRuleResult, CategoryRule } from '@finance/shared';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { RuleDto } from './dto/rule.dto.js';
import { RulesService } from './rules.service.js';

@Controller('rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  list(): Promise<CategoryRule[]> {
    return this.rules.list();
  }

  @Post()
  add(@Body() rule: RuleDto): Promise<AddRuleResult> {
    return this.rules.add(rule);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.rules.remove(id);
  }
}
