/** Dimension helpers shared by the engine. No scoring logic lives here. */
import type { DimensionId, ResolvedWeights } from '../data/types';

export const DIMENSION_IDS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as const satisfies readonly DimensionId[];

/** Normalized 0-100 score per dimension (`d_i`). */
export type DimensionScores = Readonly<Record<DimensionId, number>>;

const DECLARATION_ORDER: Readonly<Record<DimensionId, number>> = {
  D1: 0, D2: 1, D3: 2, D4: 3, D5: 4, D6: 5,
};

/** Builds a complete per-dimension record in D1→D6 order. */
export function mapDimensions<T>(f: (id: DimensionId) => T): Readonly<Record<DimensionId, T>> {
  return { D1: f('D1'), D2: f('D2'), D3: f('D3'), D4: f('D4'), D5: f('D5'), D6: f('D6') };
}

/**
 * Tie-break (spec ruling): descending weight first, then D1→D6 order. Declaration order
 * alone would silently bias every tie toward D1; weight-first means the tie-break carries
 * the industry's priorities.
 */
export function compareByWeightThenOrder(weights: ResolvedWeights) {
  return (a: DimensionId, b: DimensionId): number =>
    weights[b] - weights[a] || DECLARATION_ORDER[a] - DECLARATION_ORDER[b];
}
