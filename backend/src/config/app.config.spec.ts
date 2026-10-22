import { DEFAULT_MONGO_URI, loadAppConfig, PACKAGE_VERSION } from './app.config.js';

describe('loadAppConfig', () => {
  it('has local defaults', () => {
    expect(loadAppConfig({})).toEqual({ port: 3000, mongoUri: DEFAULT_MONGO_URI, bodyLimitMb: 50, version: PACKAGE_VERSION });
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reads the environment', () => {
    const env = { PORT: '8080', MONGO_URI: 'mongodb://db/x', BODY_LIMIT_MB: '5', APP_VERSION: '1.0.0' };
    expect(loadAppConfig(env)).toEqual({ port: 8080, mongoUri: 'mongodb://db/x', bodyLimitMb: 5, version: '1.0.0' });
  });
});
