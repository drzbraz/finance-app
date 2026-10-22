import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

export const API_PREFIX = 'api';

/** Everything main.ts sets on the app, shared with the end-to-end tests. */
export function configureApp(app: NestExpressApplication, bodyLimitMb: number): NestExpressApplication {
  app.setGlobalPrefix(API_PREFIX);
  app.useBodyParser('json', { limit: `${bodyLimitMb}mb` });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  return app;
}
