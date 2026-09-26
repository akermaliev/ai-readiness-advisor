/**
 * Fallback recommendations, available with no key and when a live call fails. The use cases
 * are pre-written examples (fallbackUseCases.ts). The narrative and roadmap around them are
 * TEMPLATED FROM THE SCORING OUTPUT — no model involved — so every sentence stays true for
 * the visitor's own answers. The result goes through the same gate verification and
 * back-office injection as a live response.
 */
import type { ModelResponse, ProblemStatement, ScoringOutput } from '../data/types';
import { dimensions } from '../data/questionBank';
import { IMBALANCE_NOTE_THRESHOLD, SENSITIVITY_TARGET } from '../data/bands';
import { blockedCategories } from '../engine/gateEvaluation';
import { fallbackUseCases } from './fallbackUseCases';
import { applyGateVerification, type VerifiedRecommendations } from './gateVerification';
import { buildRecommendationPrompt } from './prompt';

const nameOf = (id: string) => dimensions.find((d) => d.id === id)?.name ?? id;

export function buildFallbackResponse(output: ScoringOutput, problem: ProblemStatement): ModelResponse {
  const { range } = buildRecommendationPrompt(output, problem);
  const useCases = fallbackUseCases[output.industry].slice(0, range.max).map((u) => ({ ...u, isBackOfficeAlternative: false }));
  const top = output.sensitivity.find((s) => s.delta > 0);
  const blocked = blockedCategories(output.gates);
  const pilot = useCases.find((u) => blocked !== 'all' && !u.categories.some((c) => blocked.has(c))) ?? useCases[0];
  const shortfall = nameOf(output.bottleneck.dimensionId);

  const scoreNarrative = top === undefined
    ? `Your headline score of ${output.scoreGeometric} (${output.band.label}) reflects every dimension at or above adequate. The largest remaining shortfall is ${shortfall}.`
    : `Your headline score of ${output.scoreGeometric} (${output.band.label}) loses the most points in ${shortfall}. The single biggest lift would come from bringing ${nameOf(top.dimensionId)} to adequate, which would move the headline to ${output.scoreGeometric + top.delta}.`;

  return {
    scoreNarrative,
    imbalanceNote: output.compensationGap > IMBALANCE_NOTE_THRESHOLD
      ? `Your weighted average (${output.scoreArithmetic}) sits ${output.compensationGap} points above the headline because strong dimensions are offsetting weak ones in the average but not in the geometric mean.`
      : null,
    useCases,
    roadmap: {
      pilotFirst: {
        useCaseTitle: pilot?.title ?? '',
        rationale: 'The example below whose categories no active gate blocks, so it can start without first clearing a gate.',
      },
      prerequisite: top === undefined ? null
        : `Bring ${nameOf(top.dimensionId)} to adequate (${SENSITIVITY_TARGET}/100): the largest single lift to your headline (+${top.delta}).`,
      defer: useCases.filter((u) => u.title !== pilot?.title).map((u) => ({
        useCaseTitle: u.title,
        until: top === undefined ? 'the pilot has run for a quarter' : `${nameOf(top.dimensionId)} reaches adequate`,
      })),
    },
    blockedAcknowledged: [],
  };
}

export function buildFallbackRecommendations(output: ScoringOutput, problem: ProblemStatement): VerifiedRecommendations {
  const { fixture } = buildRecommendationPrompt(output, problem);
  return applyGateVerification(buildFallbackResponse(output, problem), output, fixture);
}
