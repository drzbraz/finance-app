import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { UploadedSpreadsheet } from './uploaded-spreadsheet.js';

/** The multipart `file` field → UploadedSpreadsheet; only .xlsx files are accepted. */
@Injectable()
export class SpreadsheetFilePipe implements PipeTransform<Express.Multer.File | undefined, UploadedSpreadsheet> {
  transform(file: Express.Multer.File | undefined): UploadedSpreadsheet {
    if (!file) throw new BadRequestException('Send the spreadsheet in the "file" field');
    // Multer decodes multipart file names as latin1; browsers send UTF-8 ("Controle financeiro…" with accents).
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    if (!fileName.toLowerCase().endsWith('.xlsx')) throw new BadRequestException('Only .xlsx files can be imported');
    return { fileName, data: file.buffer };
  }
}
