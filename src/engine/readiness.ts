/**
 * Stage 2 orchestrator. `computeReadiness` is the whole deterministic assessment:
 * pure, synchronous, no I/O. Identical input produces byte-identical output.
 *
 * Output precision:
 *   scoreGeometric, scoreArithmetic, compensationGap, sensitivity Δ, cross-profile  → integers
 *   contribution, σ, weightedShortfall                                            → 1 decimal
 *   contributionShare                                                             → 3 decimals
 * The headline is an integer and the band is assigned from that integer, so the number
 * on screen and its band label can never disagree. The gap and every sensitivity Δ are
 * differences of the displayed integers, so "54 → 68" always adds up on screen.
 */
import { COMPENSATION_GAP_FLOOR } from '../data/bands';
import { impactAssessmentQuestion, questionBank } from '../data/questionBank';
import type { ReadinessInput, RubricAnswers, ScoringOutput } from '../data/types';
import { assignBand, assignCompensationBand } from './banding';
import { runConsistencyChecks } from './consistency';
import { DIMENSION_IDS, mapDimensions } from './dimensions';
import { evaluateGates } from './gateEvaluation';
import { round } from './rounding';
import {
  computeArithmetic, computeBottleneck, computeContribution, computeCrossProfile, computeDispersion,
  computeGeometric, computeSensitivity, normalizeDimension, rawDimensionScores,
} from './scores';
import { resolveWeights } from './weights';

/**
 * Rejects any answer that is not one of its question's option values, and any unknown
 * question id. The type system guarantees 0-5; this guarantees the value is a real option
 * (Q1.2 has no 3, for instance).
 */
export function validateRubricAnswers(answers: RubricAnswers): void {
  const known = new Set<string>(questionBank.map((q) => q.id));
  for (const key of Object.keys(answers)) {
    if (!known.has(key)) throw new RangeError(`Unknown question id: ${key}`);
  }
  for (const q of questionBank) {
    const value: unknown = answers[q.id];
    if (!q.options.some((o) => o.points === value)) {
      const allowed = q.options.map((o) => o.points).join(', ');
      throw new RangeError(`Q${q.id}: ${String(value)} is not one of its option values (${allowed})`);
    }
  }
}

export function computeReadiness(input: ReadinessInput): ScoringOutput {
  const { rubricAnswers, industry, sizeBand, impactAssessment } = input;
  validateRubricAnswers(rubricAnswers);
  if (!impactAssessmentQuestion.options.some((o) => o.value === impactAssessment)) {
    throw new RangeError(`impactAssessment: ${String(impactAssessment)} is not one of its option values`);
  }
  const facts = { impactAssessment };

  const weights = resolveWeights(industry, sizeBand); // once per assessment
  const raw = rawDimensionScores(rubricAnswers);
  const d = mapDimensions((id) => normalizeDimension(raw[id]));

  const scoreGeometric = round(computeGeometric(d, weights), 0);
  const scoreArithmetic = round(computeArithmetic(d, weights), 0);
  // Clamped: a negative gap is an artifact of the per-dimension floor of 1, not a signal.
  const compensationGap = Math.max(COMPENSATION_GAP_FLOOR, scoreArithmetic - scoreGeometric);
  const contributions = computeContribution(d, weights);
  const band = assignBand(scoreGeometric);

  return {
    industry,
    sizeBand,
    profileWeights: weights,
    dimensions: DIMENSION_IDS.map((id) => ({
      id,
      raw: raw[id],
      normalized: d[id],
      weight: weights[id],
      contribution: round(contributions[id].contribution, 1),
      contributionShare: round(contributions[id].contributionShare, 3),
    })),
    scoreGeometric,
    scoreArithmetic,
    compensationGap,
    compensationBand: assignCompensationBand(compensationGap),
    dispersion: computeDispersion(d),
    bottleneck: computeBottleneck(d, weights),
    sensitivity: computeSensitivity(d, weights).map((s) => ({
      dimensionId: s.dimensionId,
      delta: round(s.counterfactual, 0) - scoreGeometric,
    })),
    crossProfile: computeCrossProfile(d, sizeBand).map((c) => ({
      industry: c.industry,
      score: round(c.score, 0),
    })),
    band: { label: band.label, lower: band.lower, upper: band.upper },
    gates: evaluateGates(rubricAnswers, industry, facts),
    confidenceFlags: runConsistencyChecks(rubricAnswers, d, band.id, facts),
  };
}
