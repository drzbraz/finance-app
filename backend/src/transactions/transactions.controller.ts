import type { Transaction } from '@finance/shared';
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { IdsDto } from '../common/dto/ids.dto.js';
import { ParseYearPipe } from '../common/year.pipe.js';
import { TransactionDto, TransactionsDto } from './dto/transaction.dto.js';
import { TransactionsService } from './transactions.service.js';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(@Query('year', ParseYearPipe) year: number): Promise<Transaction[]> {
    return this.transactions.listLive(year);
  }

  @Put(':id')
  save(@Param('id') id: string, @Body() transaction: TransactionDto): Promise<Transaction> {
    if (transaction.id !== id) throw new BadRequestException('The body id does not match the URL');
    return this.transactions.save(transaction);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  saveMany(@Body() body: TransactionsDto): Promise<Transaction[]> {
    return this.transactions.saveMany(body.transactions);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  restore(@Param('id') id: string, @Body() transaction: TransactionDto): Promise<void> {
    if (transaction.id !== id) throw new BadRequestException('The body id does not match the URL');
    return this.transactions.restore(transaction);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.transactions.remove(id);
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMany(@Body() body: IdsDto): Promise<void> {
    return this.transactions.removeMany(body.ids);
  }
}
