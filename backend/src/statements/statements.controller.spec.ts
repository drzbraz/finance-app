import type { StatementPreview } from '@finance/shared';
import { BadRequestException } from '@nestjs/common';
import type { Mocked } from 'vitest';
import { mockOf } from '../testing/mocks.js';
import { StatementFilePipe } from './statement-file.pipe.js';
import type { StatementImportService } from './statement-import.service.js';
import { StatementsController } from './statements.controller.js';

describe('StatementsController', () => {
  it('POST /statements/preview previews the upload', async () => {
    const importer: Mocked<StatementImportService> = mockOf<StatementImportService>();
    const preview = { bank: 'ActivoBank' } as StatementPreview;
    importer.preview.mockResolvedValue(preview);
    const file = { fileName: 'Extrato.pdf', data: Buffer.from('x') };
    await expect(new StatementsController(importer).preview(file)).resolves.toBe(preview);
    expect(importer.preview).toHaveBeenCalledWith(file);
  });
});

describe('StatementFilePipe', () => {
  const pipe = new StatementFilePipe();
  const upload = (originalname: string) => ({ originalname, buffer: Buffer.from('pdf') }) as Express.Multer.File;

  it('accepts a PDF, with its UTF-8 name restored', () => {
    expect(pipe.transform(upload(Buffer.from('Extrato março.PDF').toString('latin1')))).toEqual({ fileName: 'Extrato março.PDF', data: Buffer.from('pdf') });
  });

  it('rejects a missing file and other types', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
    expect(() => pipe.transform(upload('planilha.xlsx'))).toThrow(/Only \.pdf/);
  });
});
