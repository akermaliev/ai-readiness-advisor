/**
 * Fallback recommendations, available with no key and when a live call fails. The use cases
 * are pre-written examples (fallbackUseCases.ts). The summary and roadmap around them are
 * COMPUTED FROM THE SCORING OUTPUT — no model involved — so every sentence stays true for
 * the visitor's own answers. The result goes through the same gate verification and
 * back-office injection as a live response.
 */
import { backOfficeExamples } from '../data/backOfficeExamples';
import { SENSITIVITY_TARGET } from '../data/bands';
import { questionsByDimension } from '../data/questionBank';
import type { ModelResponse, ProblemStatement, QuestionId, ReadinessInput, ScoringOutput } from '../data/types';
import { blockedCategories } from '../engine/gateEvaluation';
import { dimensionLabel } from '../report/lookups';
import { fallbackUseCases } from './fallbackUseCases';
import { applyGateVerification, type VerifiedRecommendations } from './gateVerification';
import { isNudgeActive, useCaseRange } from './prompt';
import { deterministicSummary, fixFirstDimension, isFlatSensitivity, summaryText } from './summary';

/** The fix-first dimension's questions answered below their top option: what a deferral waits on. */
function belowTopIn(input: ReadinessInput | null, output: ScoringOutput): QuestionId[] {
  const fixFirst = fixFirstDimension(output);
  if (input === null || fixFirst === null) return [];
  return questionsByDimension[fixFirst]
    .filter((q) => input.rubricAnswers[q.id] < Math.max(...q.options.map((o) => o.points)))
    .map((q) => q.id);
}

export function buildFallbackResponse(output: ScoringOutput, problem: ProblemStatement, input: ReadinessInput | null = null): ModelResponse {
  const range = useCaseRange(isNudgeActive(problem));
  const useCases = fallbackUseCases[output.industry].slice(0, range.max).map((u) => ({ ...u, isBackOfficeAlternative: false }));
  // v1.3: on a flat ranking no dimension is a clear priority, so there is nothing to close first.
  const fixFirst = isFlatSensitivity(output) ? null : fixFirstDimension(output);
  const unlock = fixFirst === null ? [] : belowTopIn(input, output);
  const blocked = blockedCategories(output.gates);
  const unblocked = useCases.filter((u) => blocked !== 'all' && !u.categories.some((c) => blocked.has(c)));
  // Fix 1: prefer an example that neither hits a blocked gate nor depends on the fix-first dimension.
  const pilot = unblocked.find((u) => u.dependsOnDimension !== fixFirst) ?? unblocked[0] ?? useCases[0];
  const summary = deterministicSummary(output);

  return {
    scoreNarrative: summaryText(summary),
    imbalanceNote: summary.imbalanceNote,
    useCases,
    roadmap: {
      pilotFirst: {
        useCaseTitle: pilot?.title ?? '',
        // v1.3: the roadmap now sits above the use cases, so the examples are "below".
        rationale: fixFirst !== null && pilot !== undefined && pilot.dependsOnDimension !== fixFirst
          ? 'Of the examples below, the first that no active gate blocks and that does not depend on the dimension to fix first, so it can start now.'
          : 'Of the examples below, the first that no active gate blocks, so it can start without first clearing a gate.',
        successMeasure: 'The expected outcome above, measured against a baseline taken before the pilot starts.',
        stopCondition: 'The outcome has not moved against that baseline after an agreed period, or reviewers stop trusting the output.',
        goalNote: null,
      },
      prerequisite: fixFirst === null ? null
        : `Bring ${dimensionLabel(fixFirst)} to adequate (${SENSITIVITY_TARGET}/100): the top move in "Fix this first".`,
      defer: useCases.filter((u) => u.title !== pilot?.title).map((u) => ({
        useCaseTitle: u.title,
        until: fixFirst === null ? 'the pilot has run for a quarter' : `${dimensionLabel(fixFirst)} reaches adequate`,
        unlockAnswers: unlock,
      })),
    },
    blockedAcknowledged: [],
  };
}

export function buildFallbackRecommendations(output: ScoringOutput, problem: ProblemStatement, input: ReadinessInput | null = null): VerifiedRecommendations {
  const fixture = isNudgeActive(problem) ? backOfficeExamples[output.industry] : null;
  return applyGateVerification(buildFallbackResponse(output, problem, input), output, fixture);
}
