/** Methodology → Intake Question Bank → Consistency checks. Flags only; never a score penalty. */
import { consistencyChecks } from '../data/gates';
import type { BandId, ConfidenceFlag, ConsistencyCheckId, RubricAnswers } from '../data/types';
import { DIMENSION_IDS, type DimensionScores } from './dimensions';
import type { GovernanceFacts } from './gateEvaluation';

/**
 * C1-C6, in declaration order. C4 fires on every dimension ≥ 80 OR band Mature (spec ruling 3).
 * C6 (v1.1, issue 9) reads the unscored impact-assessment fact; Q4.2 ≤ 4 per spec ruling 6.
 */
export function runConsistencyChecks(
  answers: RubricAnswers, d: DimensionScores, bandId: BandId, facts: GovernanceFacts,
): readonly ConfidenceFlag[] {
  const tripped: Readonly<Record<ConsistencyCheckId, boolean>> = {
    C1: d.D1 >= 75 && answers['3.1'] <= 1,
    C2: d.D4 >= 75 && answers['4.1'] === 0,
    C3: answers['6.2'] >= 3 && answers['6.1'] === 0,
    C4: DIMENSION_IDS.every((id) => d[id] >= 80) || bandId === 5,
    C5: answers['2.1'] === 0 && answers['2.4'] >= 3,
    C6: d.D4 >= 75 && answers['4.2'] <= 4 && (facts.impactAssessment === 'no' || facts.impactAssessment === 'in-progress'),
  };
  return consistencyChecks
    .filter((c) => tripped[c.id])
    .map((c) => ({ id: c.id, description: c.description }));
}
