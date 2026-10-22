import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { buildWorkbook } from '../src/testing/workbook.fixture.js';

export const FILE_NAME = 'Controle financeiro 2026.xlsx';

export function api(app: NestExpressApplication) {
  return request(app.getHttpServer());
}

/** Uploads the synthetic 2026 sheet (or `data`) as the year's spreadsheet. */
export async function importSheet(app: NestExpressApplication, data?: Buffer, year = 2026) {
  return api(app)
    .put(`/api/years/${year}/spreadsheet`)
    .attach('file', data ?? (await buildWorkbook()), FILE_NAME)
    .expect(200);
}

/** Reads a binary response body into a Buffer. */
export function binary(res: request.Response, done: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}
