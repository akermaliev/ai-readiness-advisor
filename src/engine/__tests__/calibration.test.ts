/**
 * Stage 2 acceptance gate: the three calibration personas must land in the methodology's
 * target ranges (weak 25-40, median 40-60, strong 65-80) at their assigned profile.
 */
import { describe, expect, it } from 'vitest';
import { calibrationPersonas } from '../../data/calibrationPersonas';
import { sizeBands } from '../../data/sizeModifiers';
import { industryIds } from '../../data/weightProfiles';
import { computeReadiness } from '../readiness';

describe('calibration personas', () => {
  it.each(calibrationPersonas.filter((p) => p.target !== null))('$id lands in its target range', (p) => {
    const out = computeReadiness(p.input);
    expect(out.scoreGeometric).toBeGreaterThanOrEqual(p.target?.min ?? Number.NaN);
    expect(out.scoreGeometric).toBeLessThanOrEqual(p.target?.max ?? Number.NaN);
  });

  it('reports every persona across all 20 industry x size profiles', () => {
    const rows = calibrationPersonas.map((p) => {
      const primary = computeReadiness(p.input);
      const grid = industryIds.flatMap((industry) => sizeBands.map((s) =>
        computeReadiness({ ...p.input, industry, sizeBand: s.id }).scoreGeometric));
      const bySize = Object.fromEntries(sizeBands.map((s) => {
        const xs = industryIds.map((industry) => computeReadiness({ ...p.input, industry, sizeBand: s.id }).scoreGeometric);
        return [s.label, `${Math.min(...xs)}-${Math.max(...xs)}`];
      }));
      return {
        persona: p.id,
        target: p.target ? `${p.target.min}-${p.target.max}` : 'ref',
        geom: primary.scoreGeometric,
        arith: primary.scoreArithmetic,
        band: primary.band.label,
        grid: `${Math.min(...grid)}-${Math.max(...grid)}`,
        ...bySize,
      };
    });
    console.log(`CALIBRATION ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(calibrationPersonas.length);
  });
});
