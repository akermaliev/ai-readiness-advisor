import { describe, expect, it } from 'vitest';
import type { ReadinessInput, ScoringOutput } from '../../data/types';
import { computeReadiness } from '../readiness';
import { ALL_ZEROS, answers, maxAnswersExcept } from './helpers';

describe('computeReadiness — full hand-computed output', () => {
  /*
   * The C4 counterexample from the spec review: healthcare, 50-250, every answer at its top
   * option except Q6.4 = 0, so D6 raw = 15 (75) and every other dimension is 100.
   *   S_geom  = 100 x 0.75^0.10 = 97.16 -> 97        (band 5, Mature)
   *   S_arith = (25+15+10+30+10)x100 + 10x75 = 9750 / 100 = 97.5 -> 98
   *   gap     = 98 - 97 = 1 -> balanced
   *   sigma   = sqrt(((5 x (100 - 95.833)^2) + (75 - 95.833)^2) / 6) = 9.32 -> 9.3, range 25
   *   shortfall: only D6 is short: 10 x 25 / 100 = 2.5
   *   sensitivity: nothing below 75 -> all 0, ordered by weight 30,25,15,10,10,10
   *   cross-profile: 100 x 0.75^(w_D6/100): tech (w 15) 95.78 -> 96, others (w 10) -> 97
   *   C4 fires on band Mature even though D6 < 80 (spec ruling 3)
   */
  const input: ReadinessInput = {
    rubricAnswers: maxAnswersExcept({ '6.4': 0 }),
    industry: 'healthcare',
    sizeBand: '50-250',
  };
  const expected: ScoringOutput = {
    industry: 'healthcare',
    sizeBand: '50-250',
    profileWeights: { D1: 25, D2: 15, D3: 10, D4: 30, D5: 10, D6: 10 },
    dimensions: [
      { id: 'D1', raw: 20, normalized: 100, weight: 25, contribution: 25, contributionShare: 0.256 },
      { id: 'D2', raw: 20, normalized: 100, weight: 15, contribution: 15, contributionShare: 0.154 },
      { id: 'D3', raw: 20, normalized: 100, weight: 10, contribution: 10, contributionShare: 0.103 },
      { id: 'D4', raw: 20, normalized: 100, weight: 30, contribution: 30, contributionShare: 0.308 },
      { id: 'D5', raw: 20, normalized: 100, weight: 10, contribution: 10, contributionShare: 0.103 },
      { id: 'D6', raw: 15, normalized: 75, weight: 10, contribution: 7.5, contributionShare: 0.077 },
    ],
    scoreGeometric: 97,
    scoreArithmetic: 98,
    compensationGap: 1,
    compensationBand: 'balanced',
    dispersion: { sigma: 9.3, range: 25, unbalanced: false },
    bottleneck: { dimensionId: 'D6', weightedShortfall: 2.5 },
    sensitivity: [
      { dimensionId: 'D4', delta: 0 }, { dimensionId: 'D1', delta: 0 }, { dimensionId: 'D2', delta: 0 },
      { dimensionId: 'D3', delta: 0 }, { dimensionId: 'D5', delta: 0 }, { dimensionId: 'D6', delta: 0 },
    ],
    crossProfile: [
      { industry: 'tech-saas', score: 96 },
      { industry: 'healthcare', score: 97 },
      { industry: 'financial', score: 97 },
      { industry: 'retail-ecommerce', score: 97 },
      { industry: 'manufacturing-logistics', score: 97 },
    ],
    band: { label: 'Mature', lower: 81, upper: 100 },
    gates: [
      { id: 'G-U1', status: 'passed', condition: expect.any(String) as string, affectedCategories: ['retrieval-over-internal-content'], unblockCondition: expect.any(String) as string },
      { id: 'G-U2', status: 'passed', condition: expect.any(String) as string, affectedCategories: ['entity-resolution'], unblockCondition: expect.any(String) as string },
      { id: 'G-U3', status: 'passed', condition: expect.any(String) as string, affectedCategories: 'all', unblockCondition: expect.any(String) as string },
      { id: 'G-U4', status: 'passed', condition: expect.any(String) as string, affectedCategories: 'all', unblockCondition: expect.any(String) as string },
      { id: 'G-H1', status: 'passed', condition: expect.any(String) as string, affectedCategories: ['phi-touching'], unblockCondition: expect.any(String) as string },
      { id: 'G-H2', status: 'passed', condition: expect.any(String) as string, affectedCategories: ['clinical-decision'], unblockCondition: expect.any(String) as string },
      { id: 'G-H3', status: 'passed', condition: expect.any(String) as string, affectedCategories: 'all', unblockCondition: expect.any(String) as string },
    ],
    confidenceFlags: [
      { id: 'C4', description: 'Uniformly high self-assessment; the pattern the calibration data says is rare' },
    ],
  };

  it('matches the hand-computed ScoringOutput exactly', () => {
    expect(computeReadiness(input)).toEqual(expected);
  });

  it('emits keys in the methodology\'s output-object order, sizeBand right after industry', () => {
    expect(Object.keys(computeReadiness(input))).toEqual([
      'industry', 'sizeBand', 'profileWeights', 'dimensions', 'scoreGeometric', 'scoreArithmetic',
      'compensationGap', 'compensationBand', 'dispersion', 'bottleneck', 'sensitivity', 'crossProfile',
      'band', 'gates', 'confidenceFlags',
    ]);
  });

  it('is deterministic: identical input -> byte-identical output', () => {
    expect(JSON.stringify(computeReadiness(input))).toBe(JSON.stringify(computeReadiness(input)));
  });

  it('does not mutate its input', () => {
    const frozen = Object.freeze({ ...input, rubricAnswers: Object.freeze({ ...input.rubricAnswers }) });
    expect(() => computeReadiness(frozen)).not.toThrow();
  });
});

describe('computeReadiness — edges', () => {
  const zero: ReadinessInput = {
    rubricAnswers: answers({ D1: ALL_ZEROS, D2: ALL_ZEROS, D3: ALL_ZEROS, D4: ALL_ZEROS, D5: ALL_ZEROS, D6: ALL_ZEROS }),
    industry: 'tech-saas',
    sizeBand: '50-250',
  };

  it('all-zero company: S_geom floors to 1, S_arith is 0, and the gap clamps to 0 (never negative)', () => {
    const out = computeReadiness(zero);
    expect(out.scoreGeometric).toBe(1);
    expect(out.scoreArithmetic).toBe(0);
    expect(out.compensationGap).toBe(0);
    expect(out.compensationBand).toBe('balanced');
    expect(out.band.label).toBe('Foundational');
    expect(out.dimensions.every((d) => d.contributionShare === 0)).toBe(true);
  });

  it('all-zero company: blocks retrieval and entity-resolution, warns on process and maintainer', () => {
    const statuses = Object.fromEntries(computeReadiness(zero).gates.map((g) => [g.id, g.status]));
    expect(statuses).toEqual({ 'G-U1': 'blocked', 'G-U2': 'blocked', 'G-U3': 'warned-severe', 'G-U4': 'warned-severe' });
  });

  it('all-zero company: the largest shortfall is the heaviest dimension (tech D2, 25 x 100 / 100)', () => {
    expect(computeReadiness(zero).bottleneck).toEqual({ dimensionId: 'D2', weightedShortfall: 25 });
  });

  it('sensitivity deltas add up on screen: headline + delta = the counterfactual headline', () => {
    const out = computeReadiness({ ...zero, rubricAnswers: maxAnswersExcept({ '2.1': 0, '2.2': 0, '2.3': 1, '2.4': 0 }) });
    // D2 raw 1 -> 5; tech weights. Counterfactual raises D2 to 75: 75^0.25 x 100^0.75 = 93.06 -> 93.
    expect(out.sensitivity[0]).toEqual({ dimensionId: 'D2', delta: 93 - out.scoreGeometric });
  });

  it('rejects a value that is not one of the question\'s options (Q1.2 has no 3)', () => {
    expect(() => computeReadiness({ ...zero, rubricAnswers: { ...zero.rubricAnswers, '1.2': 3 } }))
      .toThrow(/Q1\.2: 3 is not one of its option values \(0, 2, 5\)/);
  });

  it('rejects unknown question ids', () => {
    const extra = { ...zero.rubricAnswers, '7.1': 0 } as unknown as ReadinessInput['rubricAnswers'];
    expect(() => computeReadiness({ ...zero, rubricAnswers: extra })).toThrow(/Unknown question id: 7\.1/);
  });
});
