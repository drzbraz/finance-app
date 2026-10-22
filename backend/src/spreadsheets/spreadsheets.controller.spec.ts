import { EXPORT_WARNINGS_HEADER, type ImportPreview } from '@finance/shared';
import type { Response } from 'express';
import type { Mocked } from 'vitest';
import { mockOf } from '../testing/mocks.js';
import type { SpreadsheetExportService } from './spreadsheet-export.service.js';
import type { SpreadsheetImportService } from './spreadsheet-import.service.js';
import { SpreadsheetsController } from './spreadsheets.controller.js';
import { XLSX_MIME } from './uploaded-spreadsheet.js';

describe('SpreadsheetsController', () => {
  const file = { fileName: 'Controle financeiro 2026.xlsx', data: Buffer.from('x') };
  let importer: Mocked<SpreadsheetImportService>;
  let exporter: Mocked<SpreadsheetExportService>;
  let controller: SpreadsheetsController;

  beforeEach(() => {
    importer = mockOf<SpreadsheetImportService>();
    exporter = mockOf<SpreadsheetExportService>();
    controller = new SpreadsheetsController(importer, exporter);
  });

  it('POST /spreadsheets/preview previews the upload, with an optional year', async () => {
    const preview = { existing: false } as ImportPreview;
    importer.preview.mockResolvedValue(preview);
    await expect(controller.preview(file, 2025)).resolves.toBe(preview);
    expect(importer.preview).toHaveBeenCalledWith(file, 2025);
  });

  it('PUT /years/:year/spreadsheet imports the upload into that year', async () => {
    importer.import.mockResolvedValue({ year: 2026, imported: 3, warnings: [] });
    await expect(controller.import(2026, file)).resolves.toEqual({ year: 2026, imported: 3, warnings: [] });
    expect(importer.import).toHaveBeenCalledWith(2026, file);
  });

  it('POST /years/:year/spreadsheet/export sends the xlsx with its warnings in a header', async () => {
    exporter.export.mockResolvedValue({ fileName: 'Lançamentos 2026.xlsx', data: Buffer.from('xlsx'), warnings: ['ã'] });
    const res = { setHeader: vi.fn() } as unknown as Response;

    const stream = await controller.export(2026, res);

    expect(res.setHeader).toHaveBeenCalledWith(EXPORT_WARNINGS_HEADER, encodeURIComponent('["ã"]'));
    expect(stream.getHeaders()).toMatchObject({ type: XLSX_MIME });
    expect(stream.getHeaders().disposition).toContain("filename*=UTF-8''Lan%C3%A7amentos%202026.xlsx");
  });
});
