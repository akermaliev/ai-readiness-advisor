/**
 * Stage 1 invariants. These encode properties the methodology asserts in prose,
 * so an edit to any data table that breaks one fails the build loudly.
 */
import { describe, expect, it } from 'vitest';
import { dimensions, impactAssessmentQuestion, MAX_DIMENSION_RAW, questionBank, questionsByDimension } from '../questionBank';
import { industryIds, WEIGHT_TOTAL, weightProfiles } from '../weightProfiles';
import { sizeBands, sizeModifiers } from '../sizeModifiers';
import { consistencyChecks, gates } from '../gates';
import { bands, compensationBands } from '../bands';
import { backOfficeExamples } from '../backOfficeExamples';
import type { DimensionId, QuestionId, SizeBand } from '../types';

const DIMS: readonly DimensionId[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
const SIZES: readonly SizeBand[] = sizeBands.map((s) => s.id);
const ALL_QUESTION_IDS: readonly QuestionId[] = [
  '1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '2.3', '2.4',
  '3.1', '3.2', '3.3', '3.4', '4.1', '4.2', '4.3', '4.4',
  '5.1', '5.2', '5.3', '5.4', '6.1', '6.2', '6.3', '6.4',
];
const sumOver = (rec: Readonly<Record<DimensionId, number>>): number =>
  DIMS.reduce((acc, d) => acc + rec[d], 0);

describe('weight profiles', () => {
  it.each(industryIds)('%s base weights sum to exactly 100', (industry) => {
    expect(sumOver(weightProfiles[industry])).toBe(WEIGHT_TOTAL);
  });

  it.each(SIZES)('%s size modifier deltas sum to exactly 0', (size) => {
    expect(sumOver(sizeModifiers[size])).toBe(0);
  });

  it('every industry x size combination resolves to 100 with no negative weight', () => {
    for (const industry of industryIds) {
      for (const size of SIZES) {
        const resolved = DIMS.map((d) => weightProfiles[industry][d] + sizeModifiers[size][d]);
        expect(resolved.reduce((a, b) => a + b, 0), `${industry} x ${size}`).toBe(100);
        for (const w of resolved) expect(w, `${industry} x ${size}`).toBeGreaterThan(0);
      }
    }
  });

  it('the anchor band (50-250) is all zeros', () => {
    for (const d of DIMS) expect(sizeModifiers['50-250'][d]).toBe(0);
  });
});

describe('question bank', () => {
  it('has exactly the 24 question ids, each once', () => {
    expect(questionBank.map((q) => q.id)).toEqual(ALL_QUESTION_IDS);
  });

  it.each(DIMS)('%s has four questions whose max options sum to exactly 20', (d) => {
    const qs = questionsByDimension[d];
    expect(qs).toHaveLength(4);
    const maxSum = qs.reduce((acc, q) => acc + Math.max(...q.options.map((o) => o.points)), 0);
    expect(maxSum).toBe(MAX_DIMENSION_RAW);
  });

  it('every question spans exactly 0-5: a zero option and a five option', () => {
    // Regression guard for the Q5.4 bug (lowest option was 1, not 0, before rev 13).
    for (const q of questionBank) {
      const pts = q.options.map((o) => o.points);
      expect(Math.min(...pts), q.id).toBe(0);
      expect(Math.max(...pts), q.id).toBe(5);
    }
  });

  it('lists every question\'s options in strictly ascending point order', () => {
    for (const q of questionBank) {
      const pts = q.options.map((o) => o.points);
      expect(pts, q.id).toEqual([...pts].sort((a, b) => a - b));
      expect(new Set(pts).size, q.id).toBe(pts.length);
    }
  });

  it('defines all six dimensions', () => {
    expect(dimensions.map((d) => d.id)).toEqual(DIMS);
  });
});

describe('gates', () => {
  it('has 15 gates with unique ids', () => {
    expect(gates).toHaveLength(15);
    expect(new Set(gates.map((g) => g.id)).size).toBe(15);
  });

  it('only references question ids that exist, and facts only with their real option values', () => {
    const iaValues = impactAssessmentQuestion.options.map((o) => o.value);
    for (const g of gates) {
      for (const c of g.condition.all) {
        if ('fact' in c) for (const v of c.in) expect(iaValues, g.id).toContain(v);
        else expect(ALL_QUESTION_IDS, g.id).toContain(c.questionId);
      }
    }
  });

  it('never has a category-scoped gate with an empty category list', () => {
    for (const g of gates) {
      if (g.scope.kind === 'categories') expect(g.scope.categories.length, g.id).toBeGreaterThan(0);
    }
  });

  it('marks exactly G-U3, G-U4, G-U5, G-H3, G-F3 as global', () => {
    expect(gates.filter((g) => g.scope.kind === 'global').map((g) => g.id)).toEqual([
      'G-U3', 'G-U4', 'G-U5', 'G-H3', 'G-F3',
    ]);
  });

  it('defines consistency checks C1-C6', () => {
    expect(consistencyChecks.map((c) => c.id)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
  });
});

describe('bands', () => {
  it('score bands are contiguous from 0 with no gaps or overlaps', () => {
    expect(bands[0]?.matchFrom).toBe(0);
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i]?.matchFrom).toBe(bands[i - 1]?.matchUntil);
    }
    expect(bands.at(-1)?.matchUntil).toBe(Number.POSITIVE_INFINITY);
  });

  it('compensation bands tile [0, ∞) exactly: balanced [0,5), moderate [5,15], severe (15,∞)', () => {
    expect(compensationBands[0]?.lower).toEqual({ value: 0, inclusive: true });
    expect(compensationBands.at(-1)?.upper).toBeNull();
    for (let i = 1; i < compensationBands.length; i += 1) {
      const prev = compensationBands[i - 1]?.upper;
      const next = compensationBands[i]?.lower;
      expect(prev?.value).toBe(next?.value);
      // Each boundary point belongs to exactly one band.
      expect(prev?.inclusive).not.toBe(next?.inclusive);
    }
    expect(compensationBands.find((b) => b.id === 'moderate')?.upper).toEqual({ value: 15, inclusive: true });
  });
});

describe('back-office fixtures', () => {
  it('has one fixture per industry, each a back-office alternative with at least one category', () => {
    expect(Object.keys(backOfficeExamples).sort()).toEqual([...industryIds].sort());
    for (const fixture of Object.values(backOfficeExamples)) {
      expect(fixture.isBackOfficeAlternative).toBe(true);
      expect(fixture.categories.length).toBeGreaterThan(0);
      expect(fixture.tradeoff.length).toBeGreaterThan(0);
    }
  });
});
