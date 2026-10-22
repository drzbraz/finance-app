import { EXPORT_WARNINGS_HEADER, type ImportPreview, type ImportSummary } from '@finance/shared';
import { Controller, HttpCode, HttpStatus, Param, Post, Put, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ParseOptionalYearPipe, ParseYearPipe } from '../common/year.pipe.js';
import { attachment } from './content-disposition.js';
import { SpreadsheetExportService } from './spreadsheet-export.service.js';
import { SpreadsheetFilePipe } from './spreadsheet-file.pipe.js';
import { SpreadsheetImportService } from './spreadsheet-import.service.js';
import { XLSX_MIME, type UploadedSpreadsheet } from './uploaded-spreadsheet.js';

/** Stored inline in one MongoDB document, whose limit is 16 MB. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const upload = FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } });

@Controller()
export class SpreadsheetsController {
  constructor(
    private readonly importer: SpreadsheetImportService,
    private readonly exporter: SpreadsheetExportService,
  ) {}

  /** Reads the file without saving anything; `year` overrides the one found in the sheet. */
  @Post('spreadsheets/preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(upload)
  preview(
    @UploadedFile(SpreadsheetFilePipe) file: UploadedSpreadsheet,
    @Query('year', ParseOptionalYearPipe) year?: number,
  ): Promise<ImportPreview> {
    return this.importer.preview(file, year);
  }

  @Put('years/:year/spreadsheet')
  @UseInterceptors(upload)
  import(
    @Param('year', ParseYearPipe) year: number,
    @UploadedFile(SpreadsheetFilePipe) file: UploadedSpreadsheet,
  ): Promise<ImportSummary> {
    return this.importer.import(year, file);
  }

  /** A POST: exporting re-points entries to their new cells. Warnings come in a response header. */
  @Post('years/:year/spreadsheet/export')
  @HttpCode(HttpStatus.OK)
  async export(@Param('year', ParseYearPipe) year: number, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { data, fileName, warnings } = await this.exporter.export(year);
    res.setHeader(EXPORT_WARNINGS_HEADER, encodeURIComponent(JSON.stringify(warnings)));
    return new StreamableFile(data, { type: XLSX_MIME, disposition: attachment(fileName) });
  }
}
