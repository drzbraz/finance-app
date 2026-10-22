import { Injectable } from '@nestjs/common';

/** The current time, injectable so services can be tested with a fixed clock. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }

  isoNow(): string {
    return this.now().toISOString();
  }
}
