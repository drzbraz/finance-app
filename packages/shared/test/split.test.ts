import { splitShare } from '../src/split.js';

describe('splitShare', () => {
  it('is an equal part, rounded to cents', () => {
    expect(splitShare(90, 3)).toBe(30);
    expect(splitShare(10, 3)).toBe(3.33);
    expect(splitShare(25.5, 2)).toBe(12.75);
  });
});
