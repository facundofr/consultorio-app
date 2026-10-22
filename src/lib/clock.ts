/** Server clock. Wrapped so render code stays pure and tests can reason about "now". */
export function serverNow(): Date {
  return new Date();
}
