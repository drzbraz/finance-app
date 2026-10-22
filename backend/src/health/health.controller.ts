import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import mongoose, { type Connection } from 'mongoose';
import type { AppConfig } from '../config/app.config.js';

export interface Health {
  status: 'ok';
  version: string;
}

/** Used by the Docker healthcheck and the frontend's "server unavailable" banner. */
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get()
  check(): Health {
    if (this.connection.readyState !== mongoose.ConnectionStates.connected) {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok', version: this.config.get('version', { infer: true }) };
  }
}
