import { BadRequestException } from '@nestjs/common';
import { SpreadsheetFilePipe } from './spreadsheet-file.pipe.js';

describe('SpreadsheetFilePipe', () => {
  const pipe = new SpreadsheetFilePipe();
  const upload = (originalname: string) => ({ originalname, buffer: Buffer.from('x') }) as Express.Multer.File;

  it('accepts an .xlsx and decodes its UTF-8 name', () => {
    const latin1 = Buffer.from('Lançamentos 2026.XLSX', 'utf8').toString('latin1');
    expect(pipe.transform(upload(latin1))).toEqual({ fileName: 'Lançamentos 2026.XLSX', data: Buffer.from('x') });
  });

  it('requires a file', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });

  it('rejects other file types', () => {
    expect(() => pipe.transform(upload('backup.json'))).toThrow(/xlsx/);
  });
});
