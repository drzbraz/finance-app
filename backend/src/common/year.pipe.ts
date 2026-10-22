import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

/** Route/query `year` → number, rejecting anything that is not a plausible calendar year. */
@Injectable()
export class ParseYearPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const year = Number(value);
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
      throw new BadRequestException(`Invalid year: ${value}`);
    }
    return year;
  }
}

/** Like ParseYearPipe, but a missing value is allowed and stays undefined. */
@Injectable()
export class ParseOptionalYearPipe implements PipeTransform<string | undefined, number | undefined> {
  private readonly year = new ParseYearPipe();

  transform(value: string | undefined): number | undefined {
    return value === undefined || value === '' ? undefined : this.year.transform(value);
  }
}
