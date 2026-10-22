import { readFileSync } from 'node:fs';

export interface AppConfig {
  port: number;
  mongoUri: string;
  /** Largest accepted request body (JSON backups, xlsx uploads). */
  bodyLimitMb: number;
  version: string;
}

/** The Docker database, from the host (`npm run db`); `directConnection` skips the replica set's internal host name. */
export const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/finance?directConnection=true';

/** The backend's package.json version (dist/config and src/config are both two levels below it). */
export const PACKAGE_VERSION: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    mongoUri: env.MONGO_URI ?? DEFAULT_MONGO_URI,
    bodyLimitMb: Number(env.BODY_LIMIT_MB ?? 50),
    version: env.APP_VERSION ?? PACKAGE_VERSION,
  };
}
