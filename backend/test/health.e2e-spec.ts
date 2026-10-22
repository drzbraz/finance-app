import type { NestExpressApplication } from '@nestjs/platform-express';
import { closeTestApp, createTestApp } from '../src/testing/test-app.js';
import { api } from './helpers.js';

describe('GET /api/health', () => {
  let app: NestExpressApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => closeTestApp(app));

  it('reports ok with the running version', async () => {
    await api(app).get('/api/health').expect(200, { status: 'ok', version: 'test' });
  });

  it('answers 404 outside the API', async () => {
    await api(app).get('/nothing').expect(404);
  });
});
