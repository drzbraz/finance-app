/** My share of a bill split equally on Splitwise, in cents. */
export function splitShare(total: number, people: number): number {
  return Math.round((total / people) * 100) / 100;
}
