import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mongoose, { type Connection } from 'mongoose';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const config = new ConfigService({ version: '1.2.3' });
  const withState = (readyState: number) => new HealthController({ readyState } as Connection, config as never);

  it('GET /health reports ok and the version when the database is connected', () => {
    expect(withState(mongoose.ConnectionStates.connected).check()).toEqual({ status: 'ok', version: '1.2.3' });
  });

  it('GET /health answers 503 when the database is down', () => {
    expect(() => withState(mongoose.ConnectionStates.disconnected).check()).toThrow(ServiceUnavailableException);
  });
});
