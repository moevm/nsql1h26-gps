export function levelFromExp(exp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, exp) / 100)) + 1;
}
