import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import type { AppConfig } from '../config/app.config.js';
import { UnitOfWork } from './unit-of-work.js';

// Every query inside UnitOfWork.run() joins its transaction automatically.
mongoose.set('transactionAsyncLocalStorage', true);

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({ uri: config.get('mongoUri', { infer: true }) }),
    }),
  ],
  providers: [UnitOfWork],
  exports: [UnitOfWork],
})
export class DatabaseModule {}
