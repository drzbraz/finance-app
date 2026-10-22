import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { inject } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { loadAppConfig } from '../config/app.config.js';

/** A database name unique to the calling test file, on the suite's shared replica set. */
export function testDatabaseUri(): string {
  const url = new URL(inject('mongoUri'));
  url.pathname = `/test-${Math.random().toString(36).slice(2, 10)}`;
  return url.toString();
}

/** The real application (same pipes and prefix as main.ts) on a fresh database. */
export async function createTestApp(): Promise<NestExpressApplication> {
  const config = loadAppConfig({ MONGO_URI: testDatabaseUri(), APP_VERSION: 'test' });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue(new ConfigService(config))
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, config.bodyLimitMb);
  await app.init();
  return app;
}

/** Empties every collection between tests (indexes and the app stay up). */
export async function clearDatabase(app: NestExpressApplication): Promise<void> {
  const connection = app.get<Connection>(getConnectionToken());
  await Promise.all(Object.values(connection.collections).map((collection) => collection.deleteMany({})));
}

export async function closeTestApp(app: NestExpressApplication | undefined): Promise<void> {
  if (!app) return;
  await app.get<Connection>(getConnectionToken()).dropDatabase();
  await app.close();
}
