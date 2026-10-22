import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

/**
 * Runs several repository calls as one MongoDB transaction: all of them are applied, or none.
 * Repositories need no session argument: Mongoose passes it along through AsyncLocalStorage
 * (see `transactionAsyncLocalStorage` in database.module.ts).
 */
@Injectable()
export class UnitOfWork {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.connection.transaction(() => work());
  }
}
