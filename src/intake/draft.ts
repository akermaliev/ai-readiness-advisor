/**
 * Intake state. The readiness draft has the same shape as `ReadinessInput`, with fields
 * not yet answered. `isCompleteReadiness` narrows it — the object the form built is the
 * object `computeReadiness` receives. No adapter, no mapper, no copy.
 */
import { questionBank } from '../data/questionBank';
import type {
  ImpactAssessmentStatus, IndustryId, OptionPoints, PrimaryBottleneck, ProblemStatement, QuestionId, ReadinessInput, SizeBand,
  TargetFunction, TimeHorizon,
} from '../data/types';
import { ELABORATION_MAX_CHARS } from '../data/problemStatementOptions';

export interface ReadinessDraft {
  readonly rubricAnswers: Readonly<Partial<Record<QuestionId, OptionPoints>>>;
  readonly industry: IndustryId | null;
  readonly sizeBand: SizeBand | null;
  /** Unscored (issue 9), asked on the D4 screen. */
  readonly impactAssessment: ImpactAssessmentStatus | null;
}

export const EMPTY_READINESS: ReadinessDraft = { rubricAnswers: {}, industry: null, sizeBand: null, impactAssessment: null };

export function isCompleteReadiness(d: ReadinessDraft): d is ReadinessDraft & ReadinessInput {
  return d.industry !== null && d.sizeBand !== null && d.impactAssessment !== null
    && questionBank.every((q) => d.rubricAnswers[q.id] !== undefined);
}

export interface ProblemDraft {
  readonly primaryBottleneck: PrimaryBottleneck | null;
  readonly targetFunction: TargetFunction | null;
  readonly elaboration: string;
  readonly timeHorizon: TimeHorizon | null;
}

export const EMPTY_PROBLEM: ProblemDraft = { primaryBottleneck: null, targetFunction: null, elaboration: '', timeHorizon: null };

/** Intent side only. This feeds the prompt builder, never the scoring engine. */
export function toProblemStatement(p: ProblemDraft): ProblemStatement | null {
  if (p.primaryBottleneck === null || p.targetFunction === null) return null;
  const elaboration = p.elaboration.trim().slice(0, ELABORATION_MAX_CHARS);
  return {
    primaryBottleneck: p.primaryBottleneck,
    targetFunction: p.targetFunction,
    ...(elaboration !== '' ? { elaboration } : {}),
    ...(p.timeHorizon !== null ? { timeHorizon: p.timeHorizon } : {}),
  };
}

export function problemDraftFrom(p: ProblemStatement): ProblemDraft {
  return {
    primaryBottleneck: p.primaryBottleneck,
    targetFunction: p.targetFunction,
    elaboration: p.elaboration ?? '',
    timeHorizon: p.timeHorizon ?? null,
  };
}
