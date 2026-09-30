/**
 * Fallback recommendations, available with no key and when a live call fails. The use cases
 * are pre-written examples (fallbackUseCases.ts). The summary and roadmap around them are
 * COMPUTED FROM THE SCORING OUTPUT — no model involved — so every sentence stays true for
 * the visitor's own answers. The result goes through the same gate verification and
 * back-office injection as a live response.
 */
import { backOfficeExamples } from '../data/backOfficeExamples';
import { SENSITIVITY_TARGET } from '../data/bands';
import type { ModelResponse, ProblemStatement, ScoringOutput } from '../data/types';
import { blockedCategories } from '../engine/gateEvaluation';
import { dimensionLabel } from '../report/lookups';
import { fallbackUseCases } from './fallbackUseCases';
import { applyGateVerification, type VerifiedRecommendations } from './gateVerification';
import { isNudgeActive, useCaseRange } from './prompt';
import { deterministicSummary, fixFirstDimension, summaryText } from './summary';

export function buildFallbackResponse(output: ScoringOutput, problem: ProblemStatement): ModelResponse {
  const range = useCaseRange(isNudgeActive(problem));
  const useCases = fallbackUseCases[output.industry].slice(0, range.max).map((u) => ({ ...u, isBackOfficeAlternative: false }));
  const fixFirst = fixFirstDimension(output);
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
        rationale: pilot !== undefined && pilot.dependsOnDimension !== fixFirst
          ? 'Of the examples above, the first that no active gate blocks and that does not depend on the dimension to fix first, so it can start now.'
          : 'Of the examples above, the first that no active gate blocks, so it can start without first clearing a gate.',
      },
      prerequisite: fixFirst === null ? null
        : `Bring ${dimensionLabel(fixFirst)} to adequate (${SENSITIVITY_TARGET}/100): the top move in "Fix this first".`,
      defer: useCases.filter((u) => u.title !== pilot?.title).map((u) => ({
        useCaseTitle: u.title,
        until: fixFirst === null ? 'the pilot has run for a quarter' : `${dimensionLabel(fixFirst)} reaches adequate`,
      })),
    },
    blockedAcknowledged: [],
  };
}

export function buildFallbackRecommendations(output: ScoringOutput, problem: ProblemStatement): VerifiedRecommendations {
  const fixture = isNudgeActive(problem) ? backOfficeExamples[output.industry] : null;
  return applyGateVerification(buildFallbackResponse(output, problem), output, fixture);
}
