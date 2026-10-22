import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { UploadedStatement } from './uploaded-statement.js';

/** The multipart `file` field → UploadedStatement; only PDFs are accepted. */
@Injectable()
export class StatementFilePipe implements PipeTransform<Express.Multer.File | undefined, UploadedStatement> {
  transform(file: Express.Multer.File | undefined): UploadedStatement {
    if (!file) throw new BadRequestException('Send the statement in the "file" field');
    // Multer decodes multipart file names as latin1; browsers send UTF-8.
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    if (!fileName.toLowerCase().endsWith('.pdf')) throw new BadRequestException('Only .pdf bank statements can be imported');
    return { fileName, data: file.buffer };
  }
}
