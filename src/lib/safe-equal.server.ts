// Server-only: compares secrets in constant time, so the answer time never hints
// how much of a guessed secret was right.
import { timingSafeEqual } from "node:crypto";

export function safeEqual(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
