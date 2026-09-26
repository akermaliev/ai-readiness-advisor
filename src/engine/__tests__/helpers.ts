import type { DimensionId, OptionPoints, QuestionId, RubricAnswers } from '../../data/types';
import { mapDimensions, type DimensionScores } from '../dimensions';

type Four = readonly [OptionPoints, OptionPoints, OptionPoints, OptionPoints];

/** Builds a full RubricAnswers from four answers per dimension, in question order. */
export function answers(perDim: Readonly<Record<DimensionId, Four>>): RubricAnswers {
  const out: Partial<Record<QuestionId, OptionPoints>> = {};
  for (const dim of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as const) {
    perDim[dim].forEach((v, i) => { out[`${dim.slice(1)}.${i + 1}` as QuestionId] = v; });
  }
  return out as RubricAnswers;
}

/** Every question at its top option (5). */
export const ALL_FIVES: Four = [5, 5, 5, 5];
export const ALL_ZEROS: Four = [0, 0, 0, 0];

export function maxAnswersExcept(overrides: Partial<Record<QuestionId, OptionPoints>>): RubricAnswers {
  return { ...answers({ D1: ALL_FIVES, D2: ALL_FIVES, D3: ALL_FIVES, D4: ALL_FIVES, D5: ALL_FIVES, D6: ALL_FIVES }), ...overrides };
}

/** Normalized scores from a D1..D6 tuple. */
export function scores(d1: number, d2: number, d3: number, d4: number, d5: number, d6: number): DimensionScores {
  const v = { D1: d1, D2: d2, D3: d3, D4: d4, D5: d5, D6: d6 };
  return mapDimensions((id) => v[id]);
}
