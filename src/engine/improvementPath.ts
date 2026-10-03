/**
 * v1.3 — the prerequisite as a checklist, computed from the company's own answers.
 *
 * The roadmap's first step ("close this gap") names a dimension. This module turns it into
 * concrete answer changes: starting from the current answers, repeatedly take one-option
 * steps up among that dimension's questions until it reaches adequate (SENSITIVITY_TARGET):
 * the largest step while the target is out of reach in one move, then the smallest step that
 * reaches it, so the path stops as close to the target as whole options allow (ties in
 * question order). A question raised more than once is shown as one change.
 * After each step the whole assessment is
 * recomputed with computeReadiness, so every number shown is a real engine output, and the
 * gates that stop firing are listed.
 *
 * It is one way to get there, not the only one: the fewest answer changes, each the smallest
 * step up on its question. No model involved. Pure, like the rest of the engine.
 */
import { SENSITIVITY_TARGET } from '../data/bands';
import { MAX_DIMENSION_RAW, questionsByDimension } from '../data/questionBank';
import type { DimensionId, GateId, OptionPoints, QuestionId, ReadinessInput, RubricAnswers, ScoringOutput } from '../data/types';
import { computeReadiness } from './readiness';

export interface ImprovementStep {
  readonly questionId: QuestionId;
  readonly question: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  /** The dimension's normalized score once this step and every earlier one is taken. */
  readonly dimensionAfter: number;
  /** The headline (integer) once this step and every earlier one is taken. */
  readonly headlineAfter: number;
  /** Gates that fired before this step and no longer fire after it. */
  readonly gatesCleared: readonly GateId[];
}

export interface ImprovementPath {
  readonly dimensionId: DimensionId;
  readonly dimensionBefore: number;
  readonly headlineBefore: number;
  readonly target: number;
  readonly steps: readonly ImprovementStep[];
  /** False only if every question is at its top option and the target is still out of reach. */
  readonly reachesTarget: boolean;
}

const normalizedOf = (o: ScoringOutput, id: DimensionId): number => o.dimensions.find((d) => d.id === id)?.normalized ?? 0;
const firing = (o: ScoringOutput): ReadonlySet<GateId> => new Set(o.gates.filter((g) => g.status !== 'passed').map((g) => g.id));

export function improvementPath(input: ReadinessInput, dimensionId: DimensionId, target: number = SENSITIVITY_TARGET): ImprovementPath {
  const start = computeReadiness(input);
  const rawPerPoint = 100 / MAX_DIMENSION_RAW;
  const dimensionOf = (a: RubricAnswers): number =>
    questionsByDimension[dimensionId].reduce((sum, q) => sum + a[q.id], 0) * rawPerPoint;

  // 1. Choose the moves: largest one-option step while the target is out of reach in one move,
  //    then the smallest step that reaches it.
  let answers: RubricAnswers = input.rubricAnswers;
  const order: QuestionId[] = [];
  while (dimensionOf(answers) < target) {
    const moves = questionsByDimension[dimensionId].flatMap((q) => {
      const next = q.options.find((o) => o.points > answers[q.id]);
      return next === undefined ? [] : [{ id: q.id, points: next.points, gain: next.points - answers[q.id] }];
    });
    if (moves.length === 0) break;
    const needed = (target - dimensionOf(answers)) / rawPerPoint;
    const reaching = moves.filter((m) => m.gain >= needed);
    const best = reaching.length > 0
      ? reaching.reduce((a, b) => (b.gain < a.gain ? b : a))
      : moves.reduce((a, b) => (b.gain > a.gain ? b : a));
    answers = { ...answers, [best.id]: best.points as OptionPoints };
    order.push(best.id);
  }

  // 2. One change per question, in the order each question was last raised, so a question
  //    raised twice reads as one change and the last change is the one that reaches the target.
  const sequence = order.filter((id, i) => order.lastIndexOf(id) === i);
  let current = start;
  let applied: RubricAnswers = input.rubricAnswers;
  const steps: ImprovementStep[] = sequence.map((id) => {
    const q = questionsByDimension[dimensionId].find((x) => x.id === id);
    const from = q?.options.find((o) => o.points === applied[id]);
    const to = q?.options.find((o) => o.points === answers[id]);
    applied = { ...applied, [id]: answers[id] };
    const after = computeReadiness({ ...input, rubricAnswers: applied });
    const still = firing(after);
    const step: ImprovementStep = {
      questionId: id, question: q?.prompt ?? '', fromLabel: from?.label ?? '', toLabel: to?.label ?? '',
      dimensionAfter: normalizedOf(after, dimensionId), headlineAfter: after.scoreGeometric,
      gatesCleared: [...firing(current)].filter((g) => !still.has(g)),
    };
    current = after;
    return step;
  });

  return {
    dimensionId, dimensionBefore: normalizedOf(start, dimensionId), headlineBefore: start.scoreGeometric, target, steps,
    reachesTarget: normalizedOf(current, dimensionId) >= target,
  };
}
