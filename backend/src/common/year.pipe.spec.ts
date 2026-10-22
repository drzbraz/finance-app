import { BadRequestException } from '@nestjs/common';
import { ParseOptionalYearPipe, ParseYearPipe } from './year.pipe.js';

describe('ParseYearPipe', () => {
  const pipe = new ParseYearPipe();

  it('turns a year into a number', () => {
    expect(pipe.transform('2026')).toBe(2026);
  });

  it.each(['abc', '2026.5', '1899', '2101', ''])('rejects %j', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});

describe('ParseOptionalYearPipe', () => {
  const pipe = new ParseOptionalYearPipe();

  it('keeps a missing year undefined', () => {
    expect(pipe.transform(undefined)).toBeUndefined();
    expect(pipe.transform('')).toBeUndefined();
  });

  it('validates a given year', () => {
    expect(pipe.transform('2025')).toBe(2025);
    expect(() => pipe.transform('x')).toThrow(BadRequestException);
  });
});
