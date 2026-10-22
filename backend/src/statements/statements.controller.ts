import type { StatementPreview } from '@finance/shared';
import { Controller, HttpCode, HttpStatus, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StatementFilePipe } from './statement-file.pipe.js';
import { StatementImportService } from './statement-import.service.js';
import type { UploadedStatement } from './uploaded-statement.js';

/** Statements are read, never stored; a few MB is plenty for a monthly PDF. */
export const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;

@Controller('statements')
export class StatementsController {
  constructor(private readonly importer: StatementImportService) {}

  /** Reads a bank statement PDF without saving anything. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_STATEMENT_BYTES } }))
  preview(@UploadedFile(StatementFilePipe) file: UploadedStatement): Promise<StatementPreview> {
    return this.importer.preview(file);
  }
}
