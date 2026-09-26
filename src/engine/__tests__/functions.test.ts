/**
 * One or more hand-computed cases per Stage 2 function. Expected values come from closed
 * forms (e.g. 25^0.25 x 100^0.75 = sqrt(5000)), never from re-running the engine's code path.
 */
import { describe, expect, it } from 'vitest';
import { assignBand, assignCompensationBand } from '../banding';
import { runConsistencyChecks } from '../consistency';
import { blockedCategories, evaluateGates } from '../gateEvaluation';
import {
  computeArithmetic, computeBottleneck, computeContribution, computeCrossProfile, computeDispersion,
  computeGeometric, computeSensitivity, normalizeDimension, rawDimensionScores,
} from '../scores';
import { resolveWeights } from '../weights';
import { answers, maxAnswersExcept, scores } from './helpers';

const TECH = resolveWeights('tech-saas', '50-250');        // 20 25 15 10 15 15
const HEALTH = resolveWeights('healthcare', '50-250');     // 25 15 10 30 10 10
const FIN = resolveWeights('financial', '50-250');         // 20 15 15 30 10 10

describe('resolveWeights', () => {
  it('adds the size delta to the base profile', () => {
    expect(resolveWeights('healthcare', 'lt-50')).toEqual({ D1: 25, D2: 12, D3: 10, D4: 28, D5: 13, D6: 12 });
    expect(resolveWeights('tech-saas', '1000-2000')).toEqual({ D1: 20, D2: 29, D3: 15, D4: 14, D5: 11, D6: 11 });
  });
  it('returns the base profile unchanged at the anchor band', () => {
    expect(HEALTH).toEqual({ D1: 25, D2: 15, D3: 10, D4: 30, D5: 10, D6: 10 });
  });
  it('rejects an unknown industry at runtime', () => {
    expect(() => resolveWeights('aerospace' as never, '50-250')).toThrow(RangeError);
  });
});

describe('normalizeDimension / rawDimensionScores', () => {
  it('maps raw 0-20 onto 0-100 exactly', () => {
    expect([0, 7, 13, 20].map(normalizeDimension)).toEqual([0, 35, 65, 100]);
  });
  it('sums each dimension\'s four answers', () => {
    const a = answers({ D1: [2, 2, 2, 1], D2: [1, 5, 0, 0], D3: [1, 2, 1, 2], D4: [0, 3, 0, 0], D5: [1, 2, 0, 0], D6: [2, 0, 1, 0] });
    expect(rawDimensionScores(a)).toEqual({ D1: 7, D2: 6, D3: 6, D4: 3, D5: 3, D6: 3 });
  });
});

describe('computeArithmetic', () => {
  it('is the weighted mean: healthcare, d = 80/60/40/100/20/50 -> 20+9+4+30+2+5 = 70', () => {
    expect(computeArithmetic(scores(80, 60, 40, 100, 20, 50), HEALTH)).toBe(70);
  });
});

describe('computeGeometric', () => {
  it('equals the common value when every dimension is equal', () => {
    expect(computeGeometric(scores(70, 70, 70, 70, 70, 70), TECH)).toBeCloseTo(70, 10);
  });
  it('tech, D2 = 25, rest 100 -> 25^0.25 x 100^0.75 = sqrt(5000) = 70.7107', () => {
    expect(computeGeometric(scores(100, 25, 100, 100, 100, 100), TECH)).toBeCloseTo(Math.sqrt(5000), 10);
  });
  it('floors a zeroed dimension at 1 instead of collapsing to 0: 1^0.2 x 100^0.8 = 10^1.6', () => {
    const s = computeGeometric(scores(0, 100, 100, 100, 100, 100), TECH);
    expect(s).toBeCloseTo(10 ** 1.6, 10); // 39.81
    expect(s).toBeGreaterThan(0);
  });
});

describe('computeContribution', () => {
  it('decomposes S_arith = 70 into 20/9/4/30/2/5 with shares over 70', () => {
    const c = computeContribution(scores(80, 60, 40, 100, 20, 50), HEALTH);
    expect([c.D1, c.D2, c.D3, c.D4, c.D5, c.D6].map((x) => x.contribution)).toEqual([20, 9, 4, 30, 2, 5]);
    expect(c.D4.contributionShare).toBeCloseTo(30 / 70, 12);
    expect(c.D5.contributionShare).toBeCloseTo(2 / 70, 12);
  });
  it('reports a share of 0, not NaN, when S_arith is 0', () => {
    const c = computeContribution(scores(0, 0, 0, 0, 0, 0), HEALTH);
    expect(c.D1.contributionShare).toBe(0);
  });
});

describe('computeDispersion', () => {
  it('the doc\'s example [95,95,90,30,35,75]: mean 70, variance 4500/6, sigma sqrt(750) = 27.4, range 65', () => {
    expect(computeDispersion(scores(95, 95, 90, 30, 35, 75))).toEqual({ sigma: 27.4, range: 65, unbalanced: true });
  });
  it('flat profile is balanced', () => {
    expect(computeDispersion(scores(70, 70, 70, 70, 70, 70))).toEqual({ sigma: 0, range: 0, unbalanced: false });
  });
  it('sigma exactly 20 is not unbalanced (the rule is sigma > 20)', () => {
    expect(computeDispersion(scores(100, 100, 100, 60, 60, 60))).toEqual({ sigma: 20, range: 40, unbalanced: false });
  });
});

describe('computeBottleneck (largest weighted shortfall)', () => {
  it('healthcare, D4 and D6 both at 40: D4 = 30x60/100 = 18 beats D6 = 10x60/100 = 6', () => {
    expect(computeBottleneck(scores(100, 100, 100, 40, 100, 40), HEALTH)).toEqual({ dimensionId: 'D4', weightedShortfall: 18 });
  });
  it('breaks an exact tie by descending weight: financial D1 = 10 (20x90) vs D4 = 40 (30x60), both 18 -> D4', () => {
    expect(computeBottleneck(scores(10, 100, 100, 40, 100, 100), FIN)).toEqual({ dimensionId: 'D4', weightedShortfall: 18 });
  });
});

describe('computeSensitivity', () => {
  it('tech, D2 = 25: raising D2 to 75 gives 75^0.25 x 100^0.75 - sqrt(5000) = 22.35; others are already >= 75', () => {
    const s = computeSensitivity(scores(100, 25, 100, 100, 100, 100), TECH);
    expect(s[0]?.dimensionId).toBe('D2');
    expect(s[0]?.delta).toBeCloseTo(75 ** 0.25 * 100 ** 0.75 - Math.sqrt(5000), 10);
    // Zero-delta dimensions ranked by descending weight (20, 15, 15, 15, 10), then D-order.
    expect(s.map((x) => x.dimensionId)).toEqual(['D2', 'D1', 'D3', 'D5', 'D6', 'D4']);
    expect(s.slice(1).every((x) => x.delta === 0)).toBe(true);
  });
  it('never lowers a dimension: d = 90 has delta exactly 0, never negative', () => {
    const s = computeSensitivity(scores(90, 90, 90, 90, 90, 90), TECH);
    expect(s.every((x) => x.delta === 0)).toBe(true);
  });
  it('can disagree with the bottleneck, by design (spec ruling 1)', () => {
    // Financial, D1 = 10, D4 = 40: identical weighted shortfall (18 each), but under the
    // geometric headline the weak, lightly weighted D1 is the far better move.
    const d = scores(10, 100, 100, 40, 100, 100);
    const base = 10 ** 0.2 * 40 ** 0.3 * 100 ** 0.5;
    const s = computeSensitivity(d, FIN);
    expect(s[0]?.dimensionId).toBe('D1');
    expect(s[0]?.delta).toBeCloseTo(75 ** 0.2 * 40 ** 0.3 * 100 ** 0.5 - base, 10);  // ~23.8
    expect(s[1]?.dimensionId).toBe('D4');
    expect(s[1]?.delta).toBeCloseTo(10 ** 0.2 * 75 ** 0.3 * 100 ** 0.5 - base, 10);  // ~9.9
    expect(computeBottleneck(d, FIN).dimensionId).toBe('D4');
  });
});

describe('computeCrossProfile', () => {
  it('D4 = 20, rest 100, at the anchor: score = 100 x 0.2^(w_D4 / 100) per industry', () => {
    const cp = computeCrossProfile(scores(100, 100, 100, 20, 100, 100), '50-250');
    const expected = { 'tech-saas': 10, healthcare: 30, financial: 30, 'retail-ecommerce': 15, 'manufacturing-logistics': 10 };
    expect(cp.map((c) => c.industry)).toEqual(Object.keys(expected));
    for (const c of cp) expect(c.score).toBeCloseTo(100 * 0.2 ** (expected[c.industry] / 100), 10);
  });
  it('holds the size band fixed: tech at 1000-2000 uses D4 = 10 + 4 = 14', () => {
    const cp = computeCrossProfile(scores(100, 100, 100, 20, 100, 100), '1000-2000');
    expect(cp.find((c) => c.industry === 'tech-saas')?.score).toBeCloseTo(100 * 0.2 ** 0.14, 10);
  });
});

describe('evaluateGates', () => {
  const a = maxAnswersExcept({ '3.1': 0, '4.1': 1, '4.2': 3, '4.3': 0 });
  it('returns universal + healthcare gates only, each with a status', () => {
    const r = evaluateGates(a, 'healthcare');
    expect(r.map((g) => [g.id, g.status])).toEqual([
      ['G-U1', 'passed'], ['G-U2', 'passed'], ['G-U3', 'warned-severe'], ['G-U4', 'passed'],
      ['G-H1', 'blocked'], ['G-H2', 'passed'], ['G-H3', 'warned'],
    ]);
  });
  it('reports global scope as "all" and category scope as its list', () => {
    const r = evaluateGates(a, 'healthcare');
    expect(r.find((g) => g.id === 'G-U3')?.affectedCategories).toBe('all');
    expect(r.find((g) => g.id === 'G-H1')?.affectedCategories).toEqual(['phi-touching']);
  });
  it('the same answers under financial fire G-F3 instead, and no healthcare gate', () => {
    const r = evaluateGates(a, 'financial');
    expect(r.some((g) => g.id.startsWith('G-H'))).toBe(false);
    expect(r.find((g) => g.id === 'G-F3')?.status).toBe('warned-severe');
    expect(r.find((g) => g.id === 'G-F1')?.status).toBe('blocked'); // Q4.3 = 0 <= 2
  });
  it('blockedCategories collects only blocked gates; warnings never exclude', () => {
    expect(blockedCategories(evaluateGates(a, 'healthcare'))).toEqual(new Set(['phi-touching']));
  });
});

describe('runConsistencyChecks', () => {
  const d = scores(80, 50, 50, 80, 50, 50);
  it('C1 (mature data, undocumented process), C3 (budget, no sponsor), C5 (search without APIs)', () => {
    const a = maxAnswersExcept({ '3.1': 1, '6.1': 0, '6.2': 3, '2.1': 0, '2.4': 3 });
    expect(runConsistencyChecks(a, d, 3).map((f) => f.id)).toEqual(['C1', 'C3', 'C5']);
  });
  it('C2: governance >= 75 with no written policy', () => {
    const a = maxAnswersExcept({ '4.1': 0 });
    expect(runConsistencyChecks(a, d, 3).map((f) => f.id)).toEqual(['C2']);
  });
  it('C4 fires on every dimension >= 80 OR band Mature (spec ruling 3)', () => {
    const a = maxAnswersExcept({});
    expect(runConsistencyChecks(a, scores(80, 80, 80, 80, 80, 80), 4).map((f) => f.id)).toEqual(['C4']);
    expect(runConsistencyChecks(a, scores(100, 100, 100, 100, 100, 75), 5).map((f) => f.id)).toEqual(['C4']);
    expect(runConsistencyChecks(a, scores(100, 100, 100, 100, 100, 75), 4)).toEqual([]);
  });
});

describe('assignBand / assignCompensationBand', () => {
  it('maps integer scores onto the doc\'s ranges at every boundary', () => {
    const at = (s: number) => assignBand(s).label;
    expect([0, 25, 26, 45, 46, 65, 66, 80, 81, 100].map(at)).toEqual([
      'Foundational', 'Foundational', 'Developing', 'Developing', 'Operational-capable',
      'Operational-capable', 'Scaling-capable', 'Scaling-capable', 'Mature', 'Mature',
    ]);
  });
  it('gap bands: [0,5) balanced, [5,15] moderate, (15,inf) severe', () => {
    expect([0, 4.9, 5, 15, 15.1, 40].map(assignCompensationBand)).toEqual([
      'balanced', 'balanced', 'moderate', 'moderate', 'severe', 'severe',
    ]);
  });
});
