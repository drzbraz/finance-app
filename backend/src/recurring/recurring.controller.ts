import type { RecurringItem } from '@finance/shared';
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { RecurringItemDto, RecurringRenameDto } from './dto/recurring.dto.js';
import { RecurringService } from './recurring.service.js';

@Controller('recurring')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  list(): Promise<RecurringItem[]> {
    return this.recurring.list();
  }

  @Put(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  save(@Param('key') key: string, @Body() item: RecurringItemDto): Promise<void> {
    if (item.key !== key) throw new BadRequestException('The body key does not match the URL');
    return this.recurring.save(item);
  }

  @Post('update')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(@Body() body: RecurringRenameDto): Promise<void> {
    return this.recurring.update(body);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('key') key: string): Promise<void> {
    return this.recurring.remove(key);
  }
}
