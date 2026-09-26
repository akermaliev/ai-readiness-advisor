/**
 * Methodology → Score Computation & Statistical Layer, §1-§6.
 *
 * Precision policy: functions whose results feed further computation (arithmetic,
 * geometric, contribution, sensitivity, cross-profile) return exact values and
 * `computeReadiness` rounds once, at the output. Functions whose results are final
 * output fields with a threshold attached (dispersion, bottleneck) round themselves,
 * so the threshold is applied to the same number the report shows.
 */
import { DISPERSION_SIGMA_THRESHOLD, GEOMETRIC_FLOOR, SENSITIVITY_TARGET } from '../data/bands';
import { MAX_DIMENSION_RAW, questionsByDimension } from '../data/questionBank';
import type {
  BottleneckResult, DimensionId, DispersionResult, IndustryId, ResolvedWeights, RubricAnswers, SizeBand,
} from '../data/types';
import { compareByWeightThenOrder, DIMENSION_IDS, mapDimensions, type DimensionScores } from './dimensions';
import { round } from './rounding';
import { INDUSTRY_IDS, resolveWeights } from './weights';

/** Raw 0-20 score per dimension: the sum of its four answers. */
export function rawDimensionScores(answers: RubricAnswers): DimensionScores {
  return mapDimensions((d) => questionsByDimension[d].reduce((sum, q) => sum + answers[q.id], 0));
}

/** §1 — `(raw / 20) × 100`. Multiplies first so integer raws give exact results. */
export function normalizeDimension(raw: number): number {
  return (raw * 100) / MAX_DIMENSION_RAW;
}

/** §1 — `S_arith = Σ (w_i / 100) × d_i`, computed as `Σ(w_i × d_i) / 100` to stay exact. */
export function computeArithmetic(d: DimensionScores, w: ResolvedWeights): number {
  return DIMENSION_IDS.reduce((sum, id) => sum + w[id] * d[id], 0) / 100;
}

/**
 * §1 — `S_geom = Π max(d_i, 1) ^ (w_i / 100)`. Each dimension is floored at 1 before
 * the product, so a single zeroed dimension cannot collapse the score to 0.
 */
export function computeGeometric(d: DimensionScores, w: ResolvedWeights): number {
  const logSum = DIMENSION_IDS.reduce(
    (sum, id) => sum + w[id] * Math.log(Math.max(d[id], GEOMETRIC_FLOOR)), 0);
  return Math.exp(logSum / 100);
}

export interface Contribution {
  /** Points contributed to `S_arith`: `(w_i / 100) × d_i`. */
  readonly contribution: number;
  /** `contribution_i / S_arith`; 0 when `S_arith` is 0. */
  readonly contributionShare: number;
}

/** §2 — contribution decomposition of `S_arith`. */
export function computeContribution(
  d: DimensionScores, w: ResolvedWeights,
): Readonly<Record<DimensionId, Contribution>> {
  const total = DIMENSION_IDS.reduce((sum, id) => sum + w[id] * d[id], 0);
  return mapDimensions((id) => ({
    contribution: (w[id] * d[id]) / 100,
    contributionShare: total === 0 ? 0 : (w[id] * d[id]) / total,
  }));
}

/**
 * §3 — population σ and range over the UNWEIGHTED normalized scores: the company's
 * shape, not the profile's emphasis. `unbalanced` is tested against the rounded σ the
 * report shows, so "σ 20.0, unbalanced" can never appear on screen.
 */
export function computeDispersion(d: DimensionScores): DispersionResult {
  const values = DIMENSION_IDS.map((id) => d[id]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const sigma = round(Math.sqrt(variance), 1);
  return {
    sigma,
    range: Math.max(...values) - Math.min(...values),
    unbalanced: sigma > DISPERSION_SIGMA_THRESHOLD,
  };
}

/**
 * §4 (spec ruling 1) — largest weighted shortfall: `argmax w_i × (100 − d_i) / 100`.
 * Compared as integers `w_i × (100 − d_i)` so ties are exact, then broken by descending
 * weight and D-order. Descriptive: "where you're losing the most points right now".
 */
export function computeBottleneck(d: DimensionScores, w: ResolvedWeights): BottleneckResult {
  const tiebreak = compareByWeightThenOrder(w);
  const units = mapDimensions((id) => w[id] * (100 - d[id]));
  const [top] = [...DIMENSION_IDS].sort((a, b) => units[b] - units[a] || tiebreak(a, b));
  if (top === undefined) throw new Error('unreachable: no dimensions');
  return { dimensionId: top, weightedShortfall: round(units[top] / 100, 1) };
}

export interface SensitivityCounterfactual {
  readonly dimensionId: DimensionId;
  /** Exact `S_geom(d_i → max(d_i, 75)) − S_geom`. */
  readonly delta: number;
  /** Exact counterfactual `S_geom`. */
  readonly counterfactual: number;
}

/**
 * §5 (spec ruling 4) — marginal sensitivity. Each dimension is RAISED to 75
 * (`max(d_i, 75)`); a dimension already at or above 75 has Δ = 0 and can never appear
 * with a negative delta. Ranked by exact Δ descending, ties by weight then D-order.
 * This ranking owns "fix this first".
 */
export function computeSensitivity(
  d: DimensionScores, w: ResolvedWeights,
): readonly SensitivityCounterfactual[] {
  const base = computeGeometric(d, w);
  const tiebreak = compareByWeightThenOrder(w);
  return DIMENSION_IDS.map((id): SensitivityCounterfactual => {
    if (d[id] >= SENSITIVITY_TARGET) return { dimensionId: id, delta: 0, counterfactual: base };
    const counterfactual = computeGeometric({ ...d, [id]: SENSITIVITY_TARGET }, w);
    return { dimensionId: id, delta: counterfactual - base, counterfactual };
  }).sort((a, b) => b.delta - a.delta || tiebreak(a.dimensionId, b.dimensionId));
}

/** §6 — `S_geom` under all five industry profiles, size band held fixed. Exact scores. */
export function computeCrossProfile(
  d: DimensionScores, sizeBand: SizeBand,
): readonly { readonly industry: IndustryId; readonly score: number }[] {
  return INDUSTRY_IDS.map((industry) => ({
    industry,
    score: computeGeometric(d, resolveWeights(industry, sizeBand)),
  }));
}
