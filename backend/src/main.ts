import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { AppConfig } from './config/app.config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  configureApp(app, config.get('bodyLimitMb', { infer: true }));
  const port = config.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');
  Logger.log(`finance-app backend ${config.get('version', { infer: true })} listening on :${port}`, 'Bootstrap');
}

void bootstrap();
