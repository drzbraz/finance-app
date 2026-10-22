import type { YearStatus } from '@finance/shared';
import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ParseYearPipe } from '../common/year.pipe.js';
import { YearsService } from './years.service.js';

@Controller('years')
export class YearsController {
  constructor(private readonly years: YearsService) {}

  @Get()
  list(): Promise<number[]> {
    return this.years.list();
  }

  @Get(':year')
  status(@Param('year', ParseYearPipe) year: number): Promise<YearStatus> {
    return this.years.status(year);
  }

  @Delete(':year')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('year', ParseYearPipe) year: number): Promise<void> {
    return this.years.remove(year);
  }
}
