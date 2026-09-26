/** Methodology → Calibration & Presentation → Banding, and the compensation-gap table. */
import { bands, compensationBands } from '../data/bands';
import type { Band, BandBound, CompensationBandId } from '../data/types';

/** Maps a (rounded) geometric score to its band via the half-open match intervals. */
export function assignBand(score: number): Band {
  const band = bands.find((b) => score >= b.matchFrom && score < b.matchUntil);
  if (band === undefined) throw new RangeError(`Score ${score} falls in no band`);
  return band;
}

const above = (x: number, b: BandBound | null): boolean => b === null || (b.inclusive ? x >= b.value : x > b.value);
const below = (x: number, b: BandBound | null): boolean => b === null || (b.inclusive ? x <= b.value : x < b.value);

/** Maps an already-clamped gap to balanced [0,5) / moderate [5,15] / severe (15,∞). */
export function assignCompensationBand(gap: number): CompensationBandId {
  const band = compensationBands.find((b) => above(gap, b.lower) && below(gap, b.upper));
  if (band === undefined) throw new RangeError(`Compensation gap ${gap} falls in no band`);
  return band.id;
}
