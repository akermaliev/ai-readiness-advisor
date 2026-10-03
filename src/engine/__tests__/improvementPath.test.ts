import { describe, expect, it } from 'vitest';
import { SENSITIVITY_TARGET } from '../../data/bands';
import { calibrationPersonas } from '../../data/calibrationPersonas';
import { questionsByDimension } from '../../data/questionBank';
import type { ReadinessInput } from '../../data/types';
import { computeReadiness, improvementPath } from '..';

const persona = (id: string): ReadinessInput => {
  const p = calibrationPersonas.find((x) => x.id === id);
  if (p === undefined) throw new Error(id);
  return p.input;
};

describe('v1.3 improvementPath — the prerequisite as answer changes', () => {
  it('for every persona and every dimension below adequate: reaches the target, only through that dimension, with engine numbers', () => {
    for (const p of calibrationPersonas) {
      const start = computeReadiness(p.input);
      for (const d of start.dimensions.filter((x) => x.normalized < SENSITIVITY_TARGET)) {
        const path = improvementPath(p.input, d.id);
        expect(path.reachesTarget, `${p.id} ${d.id}`).toBe(true);
        expect(path.dimensionBefore).toBe(d.normalized);
        expect(path.headlineBefore).toBe(start.scoreGeometric);
        const ids = new Set(questionsByDimension[d.id].map((q) => q.id));
        let prev = d.normalized;
        for (const s of path.steps) {
          expect(ids.has(s.questionId), `${p.id} ${s.questionId}`).toBe(true);
          expect(s.dimensionAfter).toBeGreaterThan(prev);
          prev = s.dimensionAfter;
        }
        expect(prev).toBeGreaterThanOrEqual(SENSITIVITY_TARGET);
        // Stops as close to the target as whole options allow: without the last step it is still below.
        const beforeLast = path.steps.length > 1 ? path.steps[path.steps.length - 2]?.dimensionAfter ?? 0 : d.normalized;
        expect(beforeLast).toBeLessThan(SENSITIVITY_TARGET);
      }
    }
  });

  it('median manufacturer, D1: three answer changes, landing exactly on adequate, matching the sensitivity delta', () => {
    const input = persona('median');
    const out = computeReadiness(input);
    const path = improvementPath(input, 'D1');
    expect(path.steps.map((s) => s.questionId)).toEqual(['1.2', '1.3', '1.1']);
    const last = path.steps[path.steps.length - 1];
    expect(last?.dimensionAfter).toBe(SENSITIVITY_TARGET);
    const delta = out.sensitivity.find((s) => s.dimensionId === 'D1')?.delta ?? NaN;
    expect(last?.headlineAfter).toBe(out.scoreGeometric + delta);
  });

  it('starts from the current answer label and merges repeated steps on one question', () => {
    const path = improvementPath(persona('foundational'), 'D1');
    const q12 = path.steps.filter((s) => s.questionId === '1.2');
    expect(q12).toHaveLength(1);
    expect(q12[0]?.fromLabel).toBe('No, teams keep separate versions');
    expect(q12[0]?.toLabel).toBe('Yes, documented and enforced');
    // Leaving "no single source of truth" clears the entity-resolution gates.
    expect(q12[0]?.gatesCleared).toEqual(expect.arrayContaining(['G-U2', 'G-R2']));
  });

  it('a dimension already at adequate needs no steps', () => {
    const path = improvementPath(persona('strong'), 'D3');
    expect(path.steps).toEqual([]);
    expect(path.reachesTarget).toBe(true);
  });
});
