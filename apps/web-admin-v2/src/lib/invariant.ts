/**
 * Lightweight assertion helper
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[Assertion Error] ${message}`);
  }
}
