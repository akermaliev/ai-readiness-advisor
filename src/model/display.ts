/** Pure display helpers for the recommendations view (v1.2, A6). No React, so they are unit-tested. */
import { targetFunctionOptions } from '../data/problemStatementOptions';

/** "until" text from the model, without trailing punctuation, so "Defer X until Y." never ends in "..". */
export function untilText(until: string): string {
  return until.trim().replace(/[\s.!?;:,]+$/u, '');
}

/** A known target-function id ("supply-chain") as its label ("Supply chain"); anything else as given. */
export function areaLabel(targetFunction: string): string {
  return targetFunctionOptions.find((o) => o.id === targetFunction.trim())?.label ?? targetFunction;
}
