/** Methodology → Gate Layer. Interprets the declarative gates in `data/gates.ts`. */
import { gates } from '../data/gates';
import type {
  AnswerCondition, FactCondition, GateResult, GateStatus, ImpactAssessmentStatus, IndustryId, RubricAnswers, UseCaseCategory,
} from '../data/types';

/** Unscored inputs a gate may read (v1.1, issue 9). */
export interface GovernanceFacts {
  readonly impactAssessment: ImpactAssessmentStatus;
}

function holds(c: AnswerCondition | FactCondition, answers: RubricAnswers, facts: GovernanceFacts): boolean {
  if ('fact' in c) return c.in.includes(facts[c.fact]);
  const answer = answers[c.questionId];
  switch (c.op) {
    case 'eq': return answer === c.value;
    case 'lte': return answer <= c.value;
    case 'gte': return answer >= c.value;
  }
}

/**
 * Evaluates every gate that applies to the industry (universal + that sector) and returns
 * one result per gate, passed ones included, in declaration order. Independent of the
 * composite score. `affectedCategories` is `'all'` for a global-scope gate.
 */
export function evaluateGates(
  answers: RubricAnswers, industry: IndustryId, facts: GovernanceFacts,
): readonly GateResult[] {
  return gates
    .filter((g) => g.appliesTo === 'universal' || g.appliesTo === industry)
    .map((g): GateResult => {
      const fired = g.condition.all.every((c) => holds(c, answers, facts));
      const status: GateStatus = !fired ? 'passed'
        : g.effect === 'block' ? 'blocked'
        : g.effect === 'warn-severe' ? 'warned-severe'
        : 'warned';
      return {
        id: g.id,
        status,
        condition: g.conditionText,
        affectedCategories: g.scope.kind === 'global' ? 'all' : g.scope.categories,
        unblockCondition: g.unblockCondition,
      };
    });
}

/**
 * The exclusion list: every category reached by a BLOCKED gate. Warnings never exclude.
 * `'all'` is returned if a blocked gate is global (none are, in the current gate set).
 */
export function blockedCategories(results: readonly GateResult[]): ReadonlySet<UseCaseCategory> | 'all' {
  const out = new Set<UseCaseCategory>();
  for (const r of results) {
    if (r.status !== 'blocked') continue;
    if (r.affectedCategories === 'all') return 'all';
    for (const c of r.affectedCategories) out.add(c);
  }
  return out;
}
