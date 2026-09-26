/**
 * Prompt builder — Methodology → Model Output Contract. Serializes the full ScoringOutput
 * plus the problem statement and nothing else. Gates go in as constraints the model may
 * not override; they are verified again in code after it responds (gateVerification.ts).
 */
import { backOfficeExamples } from '../data/backOfficeExamples';
import { IMBALANCE_NOTE_THRESHOLD } from '../data/bands';
import { gates } from '../data/gates';
import { BACK_OFFICE_NUDGE_FUNCTIONS } from '../data/problemStatementOptions';
import type { BackOfficeFixture, ProblemStatement, ScoringOutput } from '../data/types';
import { useCaseCategoryLabels } from '../data/useCaseCategories';
import { USE_CASE_CATEGORIES } from './vocabulary';

export interface UseCaseRange { readonly min: number; readonly max: number }

export interface RecommendationPrompt {
  readonly system: string;
  readonly user: string;
  readonly nudge: boolean;
  /** The pre-written back-office alternative to inject, when the nudge is active. */
  readonly fixture: BackOfficeFixture | null;
  /** How many use cases the model itself must return (spec ruling 5: 2-3 when the nudge is active). */
  readonly range: UseCaseRange;
}

export function isNudgeActive(problem: ProblemStatement): boolean {
  return BACK_OFFICE_NUDGE_FUNCTIONS.includes(problem.targetFunction);
}

export function useCaseRange(nudge: boolean): UseCaseRange {
  return nudge ? { min: 2, max: 3 } : { min: 2, max: 4 };
}

const SCHEMA = `{
  "scoreNarrative": "string, <= 60 words, explains what drove the score",
  "imbalanceNote": "string | null — a string only when compensationGap > ${IMBALANCE_NOTE_THRESHOLD}, otherwise null",
  "useCases": [
    {
      "title": "string",
      "description": "string, <= 40 words",
      "categories": ["zero or more values from the category vocabulary"],
      "targetFunction": "string",
      "expectedOutcome": "string, <= 25 words, stated as an outcome not a feature",
      "outcomeConfidence": "high | medium | low",
      "implementationRisk": "low | medium | high",
      "riskDrivers": ["string"],
      "governanceFlags": [{ "type": "data-sensitivity | compliance | reliability | oversight", "note": "string, <= 25 words" }],
      "dependsOnDimension": "D1 | D2 | D3 | D4 | D5 | D6",
      "isBackOfficeAlternative": false
    }
  ],
  "roadmap": {
    "pilotFirst": { "useCaseTitle": "string — exactly the title of one of your useCases", "rationale": "string, <= 30 words" },
    "prerequisite": "string | null — the gap to close before the pilot",
    "defer": [{ "useCaseTitle": "string", "until": "string" }]
  },
  "blockedAcknowledged": [
    { "title": "string", "description": "string, <= 40 words", "useCaseCategory": "a category from the vocabulary", "gateId": "string", "unblockCondition": "string" }
  ]
}`;

export function buildRecommendationPrompt(output: ScoringOutput, problem: ProblemStatement): RecommendationPrompt {
  const nudge = isNudgeActive(problem);
  const range = useCaseRange(nudge);
  const fixture = nudge ? backOfficeExamples[output.industry] : null;

  const blocked = output.gates.filter((g) => g.status === 'blocked');
  const warned = output.gates.filter((g) => g.status === 'warned' || g.status === 'warned-severe');
  const effect = (id: string) => gates.find((g) => g.id === id)?.effectText ?? '';

  const vocabulary = USE_CASE_CATEGORIES.map((c) => `- ${c}: ${useCaseCategoryLabels[c]}`).join('\n');
  const exclusions = blocked.length === 0
    ? 'None. No category is excluded for this company.'
    : blocked.map((g) => `- ${g.id} excludes ${g.affectedCategories === 'all' ? 'ALL use cases' : g.affectedCategories.join(', ')}. Unblocks when: ${g.unblockCondition}`).join('\n');
  const warnings = warned.length === 0
    ? 'None.'
    : warned.map((g) => `- ${g.id} (${g.status === 'warned-severe' ? 'severe' : 'warning'}): ${effect(g.id)}`).join('\n');

  const nudgeRules = nudge
    ? `The company asked about "${problem.targetFunction}". A pre-written back-office alternative (given in the user message) will be shown next to your use cases. Do NOT generate a back-office alternative of your own and do not duplicate that one; set "isBackOfficeAlternative": false on every use case you return. You may reference it by title in the roadmap.`
    : 'Set "isBackOfficeAlternative": false on every use case.';

  const system = `You write the recommendation layer of an AI-readiness report for one company.

The readiness assessment was computed deterministically in code before you were called. You explain it and recommend against it. Rules you must follow:
1. Do not recompute, revise, or comment on the correctness of any score. Explain what drove it.
2. Do not recommend any use case in an excluded category (listed below). For categories that are excluded but relevant to what the company asked for, add a "blockedAcknowledged" entry naming the use case that would have fit, its category, the gate, and what would unblock it.
3. Respect every warning below; they narrow what you may recommend.
4. Never issue a verdict on whether the company should adopt AI. No go/no-go language, no "you are ready for AI".
5. Sequence the roadmap using the assessment's "sensitivity" ranking, which is already the fix-first order. Do not invent a different priority order.
6. Tag every use case with every category from the vocabulary that applies to it. Use an empty list only if none of them applies. Tagging is checked in code; an untagged excluded use case is still a violation.
7. Return between ${range.min} and ${range.max} use cases.
8. Reply with exactly one JSON object matching the schema. No prose, no markdown, no code fences.

${nudgeRules}

Category vocabulary:
${vocabulary}

Excluded categories (hard constraints from blocked gates):
${exclusions}

Warnings in force:
${warnings}

Schema:
${SCHEMA}`;

  const sections = [
    'Deterministic assessment (computed in code; do not recompute):',
    `<scoring_output>\n${JSON.stringify(output, null, 2)}\n</scoring_output>`,
    'Problem statement (what the company wants; never part of the score):',
    `<problem_statement>\n${JSON.stringify(problem, null, 2)}\n</problem_statement>`,
  ];
  if (fixture !== null) {
    const { tradeoff: _tradeoff, ...shown } = fixture;
    sections.push('Pre-written back-office alternative that will be shown alongside your use cases:');
    sections.push(`<back_office_alternative>\n${JSON.stringify(shown, null, 2)}\n</back_office_alternative>`);
  }
  sections.push('Return the JSON object now.');

  return { system, user: sections.join('\n\n'), nudge, fixture, range };
}

export function repairInstruction(errors: readonly string[], range: UseCaseRange): string {
  return `Your previous reply could not be used: it did not match the required schema.
Problems found:
${errors.slice(0, 12).map((e) => `- ${e}`).join('\n')}

Reply again with exactly one JSON object that matches the schema in the system prompt, with ${range.min}-${range.max} use cases. No prose, no markdown, no code fences.`;
}
