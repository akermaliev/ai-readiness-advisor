/**
 * Stage 1 — score bands and the compensation-gap interpretation table.
 *
 * Transcribed from "AI Readiness Advisor — Scoring Methodology Specification"
 * → Calibration & Presentation → Banding, and → 1. Composite scores.
 *
 * `lower`/`upper` are the ranges exactly as the doc prints them and are what
 * `ScoringOutput.band` carries to the UI. `matchFrom`/`matchUntil` are the
 * half-open intervals [matchFrom, matchUntil) Stage 2 matches a continuous
 * `S_geom` against — the displayed ranges leave integer gaps (25 → 26), so a
 * score of 25.4 would otherwise fall into no band.
 *
 * A self-report instrument does not support point precision: report the band,
 * make the number secondary.
 */

import type { Band, CompensationBand } from './types';

export const bands = [
  {
    id: 1,
    label: 'Foundational',
    lower: 0,
    upper: 25,
    framing:
      'Prerequisites not yet in place; the first project is infrastructure, not AI',
    matchFrom: 0,
    matchUntil: 26,
  },
  {
    id: 2,
    label: 'Developing',
    lower: 26,
    upper: 45,
    framing: 'Narrow, low-risk pilots viable; core gaps remain',
    matchFrom: 26,
    matchUntil: 46,
  },
  {
    id: 3,
    label: 'Operational-capable',
    lower: 46,
    upper: 65,
    framing: 'Real use cases viable with scoped governance',
    matchFrom: 46,
    matchUntil: 66,
  },
  {
    id: 4,
    label: 'Scaling-capable',
    lower: 66,
    upper: 80,
    framing: 'Multiple viable use cases; sequencing is the question',
    matchFrom: 66,
    matchUntil: 81,
  },
  {
    id: 5,
    label: 'Mature',
    lower: 81,
    upper: 100,
    framing: 'Rare; verify against the confidence flags before trusting',
    matchFrom: 81,
    /** Exclusive upper bound chosen so a perfect 100 still matches. */
    matchUntil: Number.POSITIVE_INFINITY,
  },
] as const satisfies readonly Band[];

/**
 * Band 5 should trigger a C4 confidence flag by default and display a note that
 * uniformly high self-assessment is statistically unusual.
 */
export const BAND_REQUIRING_CONFIDENCE_NOTE = 5;

/**
 * The `S_arith − S_geom` gap table. The gap is a finding in its own right:
 * it is how the methodology operationalizes non-compensatory readiness.
 */
export const compensationBands = [
  {
    id: 'balanced',
    gapText: '< 5',
    interpretation: 'Balanced readiness; the composite is a fair summary',
    lower: { value: 0, inclusive: true },
    upper: { value: 5, inclusive: false },
  },
  {
    id: 'moderate',
    gapText: '5-15',
    interpretation: 'Moderate imbalance; weak dimensions are being masked',
    lower: { value: 5, inclusive: true },
    upper: { value: 15, inclusive: true },
  },
  {
    id: 'severe',
    gapText: '> 15',
    interpretation:
      'Severe imbalance; the average materially overstates practical readiness',
    lower: { value: 15, inclusive: false },
    upper: null,
  },
] as const satisfies readonly CompensationBand[];

/** The compensation gap is clamped at this floor before banding (spec ruling, gap bands). */
export const COMPENSATION_GAP_FLOOR = 0;

/**
 * Spec ruling 5: the imbalance note shows at gap ≥ this, aligned with the band boundary
 * (a gap of exactly 5 is "moderate"). Equivalently: whenever the compensation band is not
 * balanced.
 */
export const IMBALANCE_NOTE_THRESHOLD = 5;

/**
 * Issue 2: when every "fix this first" Δ is at or below this, the ranking is qualified in
 * the report and summary, because the order comes down to rounding.
 */
export const FLAT_SENSITIVITY_MAX_DELTA = 2;

/** Dispersion flag threshold: σ above this is "unbalanced readiness". */
export const DISPERSION_SIGMA_THRESHOLD = 20;

/** The "adequate" target each dimension is raised to for marginal sensitivity. */
export const SENSITIVITY_TARGET = 75;

/**
 * Each `d_i` is floored at this before taking logs (spec ruling 1). A deliberate calibration
 * parameter, not a divide-by-zero guard: 1 is the unique floor at which ln(d) = 0, so a
 * dimension with no capability contributes nothing to the weighted log-sum rather than
 * subtracting from the others. The report names any dimension at 0.
 */
export const GEOMETRIC_FLOOR = 1;
