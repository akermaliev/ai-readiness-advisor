/**
 * Decimal rounding via exponent shifting rather than `x * 10^dp`, so values like 4.55
 * round to 4.6 instead of 4.5 (4.55 is 4.5499999... in binary; its decimal string is not).
 * Half rounds up. Negative zero is normalized to 0 so output is byte-identical.
 */
export function round(x: number, dp: number): number {
  if (!Number.isFinite(x)) throw new RangeError(`Cannot round a non-finite value: ${x}`);
  if (Math.abs(x) < 1e-9) return 0;
  const shifted = Math.round(Number(`${x}e${dp}`));
  return Number(`${shifted}e-${dp}`) + 0;
}
