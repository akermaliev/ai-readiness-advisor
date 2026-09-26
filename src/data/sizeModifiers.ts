/**
 * Stage 1 — the 4-band × 6-dimension company size modifier table.
 *
 * Transcribed from "AI Readiness Advisor — Scoring Methodology Specification"
 * → Industry Weight Profiles → Company Size Modifier.
 *
 * `finalWeight_i = baseWeight_i(industry) + sizeModifier_i(sizeBand)`
 *
 * Invariant (asserted in the Stage 1 test): each band's six deltas sum to exactly 0,
 * so base + modifier sums to 100 for any industry × size combination.
 *
 * Rationale: at the small end there is usually no redundancy — one technical person
 * or one sponsor leaving can kill the initiative outright, so D5 and D6 gain weight.
 * At the large end the failure mode is complexity — more legacy systems, more approval
 * layers, more formal governance — so D2 and D4 gain weight instead.
 *
 * Known limitation carried from the methodology: this modifier is shared across all
 * five industries rather than crossed with them. A 60-person fintech and a 60-person
 * retailer get the same shift. Deliberate simplification, not an oversight.
 */

import type { SizeBand, SizeModifier } from './types';

export const sizeModifiers = {
  'lt-50': { D1: 0, D2: -3, D3: 0, D4: -2, D5: 3, D6: 2 },
  /** Anchor band: zero shift. The base industry profiles assume a mid-market company. */
  '50-250': { D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 0 },
  '250-1000': { D1: 0, D2: 2, D3: 0, D4: 2, D5: -2, D6: -2 },
  '1000-2000': { D1: 0, D2: 4, D3: 0, D4: 4, D5: -4, D6: -4 },
} as const satisfies Record<SizeBand, SizeModifier>;

/** The four bands in display order, with the labels the intake form shows. */
export const sizeBands = [
  { id: 'lt-50', label: '<50' },
  { id: '50-250', label: '50-250', isAnchor: true },
  { id: '250-1000', label: '250-1,000' },
  { id: '1000-2000', label: '1,000-2,000' },
] as const satisfies readonly { id: SizeBand; label: string; isAnchor?: boolean }[];

/** The anchor band, whose modifier is all zeros. */
export const ANCHOR_SIZE_BAND: SizeBand = '50-250';
