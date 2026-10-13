/** Pure display helpers for the recommendations view (v1.2, A6). No React, so they are unit-tested. */
import { targetFunctionOptions } from '../data/problemStatementOptions';

/**
 * "until" text from the model, without trailing punctuation, so "Defer X until Y." never ends
 * in "..". A capitalised first word is lowered ("until An agreed..." -> "until an agreed..."),
 * but an acronym or id is left alone ("SKU", "D1").
 */
export function untilText(until: string): string {
  const t = until.trim().replace(/[\s.!?;:,]+$/u, '');
  return /^\p{Lu}\p{Ll}/u.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/** A known target-function id ("supply-chain") as its label ("Supply chain"); anything else as given. */
export function areaLabel(targetFunction: string): string {
  return targetFunctionOptions.find((o) => o.id === targetFunction.trim())?.label ?? targetFunction;
}
