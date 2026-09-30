/**
 * The score narrative, computed from ScoringOutput with no model involved (v1.1, Fix 2).
 *
 * The model used to write `scoreNarrative` and `imbalanceNote`, restating numbers the report
 * already shows. Nothing checked those restatements, and they read as authoritative because
 * they sat under a correct report. Both the live path and the fallback now show this summary
 * instead; every number in it is read from ScoringOutput (or is a named methodology constant).
 */
import { FLAT_SENSITIVITY_MAX_DELTA, IMBALANCE_NOTE_THRESHOLD, SENSITIVITY_TARGET } from '../data/bands';
import type { DimensionId, DimensionScore, ScoringOutput } from '../data/types';
import { dimensionLabel } from '../report/lookups';

const DIMENSION_ORDER: readonly DimensionId[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];

/**
 * The dimension to fix first: the first entry in the sensitivity ranking with Δ > 0, i.e. the
 * top row of the report's "Fix this first" list. Null when every dimension is at or above
 * adequate (75), in which case the roadmap has no prerequisite.
 */
export function fixFirstDimension(output: ScoringOutput): DimensionId | null {
  return output.sensitivity.find((s) => s.delta > 0)?.dimensionId ?? null;
}

/** True when there is more than one move and every move is worth ≤ 2 points (issue 2). */
export function isFlatSensitivity(output: ScoringOutput): boolean {
  const moves = output.sensitivity.filter((s) => s.delta > 0);
  return moves.length > 1 && moves.every((s) => s.delta <= FLAT_SENSITIVITY_MAX_DELTA);
}

/** Largest contribution to the weighted average; ties by weight, then D-order (spec tie-break). */
function largestContributor(output: ScoringOutput): DimensionScore | undefined {
  return [...output.dimensions].sort((a, b) =>
    b.contribution - a.contribution || b.weight - a.weight
    || DIMENSION_ORDER.indexOf(a.id) - DIMENSION_ORDER.indexOf(b.id))[0];
}

export interface DeterministicSummary {
  /** The four statements Fix 2 requires, in order: headline, contributor, shortfall, top fix. */
  readonly sentences: readonly string[];
  /** Issue 2: present when the fix-first ranking is decided by rounding. */
  readonly flatNote: string | null;
  /** Spec ruling 5: present whenever the gap is ≥ 5 (the compensation band is not balanced). */
  readonly imbalanceNote: string | null;
}

export function deterministicSummary(output: ScoringOutput): DeterministicSummary {
  const headline = `Your headline score is ${output.scoreGeometric}, in the ${output.band.label} band (${output.band.lower}–${output.band.upper}).`;

  const top = largestContributor(output);
  const contributor = top === undefined ? null
    : `The largest contributor to your weighted average is ${dimensionLabel(top.id)}, with ${top.contribution.toFixed(1)} of its ${output.scoreArithmetic} points.`;

  const { bottleneck } = output;
  const shortfall = bottleneck.weightedShortfall === 0
    ? 'No dimension has a weighted shortfall: every one is at 100.'
    : `The largest weighted shortfall is ${dimensionLabel(bottleneck.dimensionId)}, which costs ${bottleneck.weightedShortfall.toFixed(1)} points of the weighted average.`;

  const fix = output.sensitivity.find((s) => s.delta > 0);
  const fixFirst = fix === undefined
    ? `Every dimension is at or above adequate (${SENSITIVITY_TARGET}), so no move is flagged to fix first.`
    : `The top fix-first move is raising ${dimensionLabel(fix.dimensionId)} to adequate (${SENSITIVITY_TARGET}), which would move the headline from ${output.scoreGeometric} to ${output.scoreGeometric + fix.delta}.`;

  return {
    sentences: [headline, ...(contributor === null ? [] : [contributor]), shortfall, fixFirst],
    flatNote: isFlatSensitivity(output)
      ? `No dimension is a clear priority: every fix-first move is worth ${FLAT_SENSITIVITY_MAX_DELTA} points or less, so the order comes down to rounding.`
      : null,
    imbalanceNote: output.compensationGap >= IMBALANCE_NOTE_THRESHOLD
      ? `Your weighted average (${output.scoreArithmetic}) sits ${output.compensationGap} points above the headline: strong dimensions offset weak ones in an average, but not in the geometric mean the headline uses.`
      : null,
  };
}

/** The summary as one paragraph, for the model contract's `scoreNarrative` on the fallback path. */
export function summaryText(s: DeterministicSummary): string {
  return [...s.sentences, ...(s.flatNote === null ? [] : [s.flatNote])].join(' ');
}
