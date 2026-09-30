/**
 * Prompt builder — Methodology → Model Output Contract.
 *
 * Spec ruling 4: the model receives the ScoringOutput, the problem statement, and the
 * constraints needed to honor them — the active gates (with effect text), the category
 * vocabulary, the six dimensions' names (Fix 1), the fix-first dimension (Fix 1), and the
 * back-office fixture when the nudge is active — and nothing else about the company.
 * Gates are verified again in code after it responds (gateVerification.ts).
 */
import { backOfficeExamples } from '../data/backOfficeExamples';
import { SENSITIVITY_TARGET } from '../data/bands';
import { gates } from '../data/gates';
import { BACK_OFFICE_NUDGE_FUNCTIONS } from '../data/problemStatementOptions';
import { dimensions } from '../data/questionBank';
import type { BackOfficeFixture, DimensionId, ProblemStatement, ScoringOutput } from '../data/types';
import { useCaseCategoryLabels } from '../data/useCaseCategories';
import { dimensionLabel } from '../report/lookups';
import { fixFirstDimension } from './summary';
import { USE_CASE_CATEGORIES } from './vocabulary';

export interface UseCaseRange { readonly min: number; readonly max: number }

/** Everything the validator needs to check a reply against this prompt. */
export interface ReplyContract {
  readonly range: UseCaseRange;
  /** The dimension the prerequisite must name, or null when none is below adequate. */
  readonly fixFirst: DimensionId | null;
  /** Title the pilot may reference besides the model's own use cases (the injected fixture). */
  readonly fixtureTitle: string | null;
}

export interface RecommendationPrompt extends ReplyContract {
  readonly system: string;
  readonly user: string;
  readonly nudge: boolean;
  /** The pre-written back-office alternative to inject, when the nudge is active. */
  readonly fixture: BackOfficeFixture | null;
}

export function isNudgeActive(problem: ProblemStatement): boolean {
  return BACK_OFFICE_NUDGE_FUNCTIONS.includes(problem.targetFunction);
}

export function useCaseRange(nudge: boolean): UseCaseRange {
  return nudge ? { min: 2, max: 3 } : { min: 2, max: 4 };
}

const SCHEMA = `{
  "scoreNarrative": "string — ONE sentence, no numbers. Not shown to the reader; the report states the score itself",
  "imbalanceNote": "string | null — ONE sentence, no numbers, when compensationBand is not \\"balanced\\"; otherwise null. Not shown to the reader",
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
      "dependsOnDimension": "D1 | D2 | D3 | D4 | D5 | D6 — the ONE dimension this use case most depends on",
      "isBackOfficeAlternative": false
    }
  ],
  "roadmap": {
    "pilotFirst": { "useCaseTitle": "string — exactly the title of one of your useCases", "rationale": "string, <= 30 words" },
    "prerequisite": "string | null — see the fix-first rule",
    "defer": [{ "useCaseTitle": "string", "until": "string" }]
  },
  "blockedAcknowledged": [
    { "title": "string", "description": "string, <= 40 words", "useCaseCategory": "a category from the vocabulary", "gateId": "string", "unblockCondition": "string" }
  ]
}`;

/** The six dimensions: id, exact name, and what each measures. From data/questionBank.ts. */
function dimensionBlock(): string {
  return dimensions.map((d) => `- ${d.id} ${d.name}: ${d.measures}.`).join('\n');
}

function fixFirstRule(fixFirst: DimensionId | null): string {
  if (fixFirst === null) {
    return `No dimension is below adequate (${SENSITIVITY_TARGET}/100), so there is no dimension to fix first. Set "roadmap.prerequisite" to null.`;
  }
  const label = dimensionLabel(fixFirst);
  return `The dimension to fix first is ${label}: it is the top entry in the assessment's "sensitivity" ranking, the weakest link whose improvement would lift the headline most.
- "roadmap.prerequisite" must name it, written as "${label}", and say what closing that gap involves.
- "roadmap.pilotFirst" must be a use case whose "dependsOnDimension" is NOT ${fixFirst}, so the pilot can start before that gap is closed.
- Defer use cases that depend on ${fixFirst} until it is improved.
- Set every "dependsOnDimension" honestly. Never change it to satisfy this rule: if no suitable pilot avoids ${fixFirst}, choose the best one anyway; code will flag the dependency, which is acceptable.`;
}

export function buildRecommendationPrompt(output: ScoringOutput, problem: ProblemStatement): RecommendationPrompt {
  const nudge = isNudgeActive(problem);
  const range = useCaseRange(nudge);
  const fixture = nudge ? backOfficeExamples[output.industry] : null;
  const fixFirst = fixFirstDimension(output);

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

  const fixtureBlockedBy = fixture === null ? [] : blocked.filter((g) =>
    g.affectedCategories === 'all' || fixture.categories.some((c) => (g.affectedCategories as readonly string[]).includes(c)));
  const fixtureUse = fixtureBlockedBy.length > 0
    ? `It is currently blocked by ${fixtureBlockedBy.map((g) => g.id).join(', ')}, so do not choose it as the pilot or defer it; it will be shown as blocked.`
    : 'You may reference it by its exact title in the roadmap.';
  const nudgeRules = nudge
    ? `The company asked about "${problem.targetFunction}". A pre-written back-office alternative (given in the user message) will be shown next to your use cases. Do NOT generate a back-office alternative of your own and do not duplicate that one; set "isBackOfficeAlternative": false on every use case you return. ${fixtureUse}`
    : 'Set "isBackOfficeAlternative": false on every use case.';

  const system = `You write the recommendation layer of an AI-readiness report for one company.

The readiness assessment was computed deterministically in code before you were called, and the report already states every score, contribution and ranking. You recommend against it. Rules you must follow:
1. Do not recompute, restate, quote or characterize any score, contribution, shortfall, delta or ranking anywhere in your use cases or roadmap. No numbers from the assessment. The report shows them; a restatement can only add errors.
2. Refer to a dimension only as its id plus its exact name, e.g. "D2 Integration architecture". Never rename, paraphrase or reinterpret a dimension, and never attach a different meaning to an id. The six dimensions are listed below.
3. Follow the fix-first rule below exactly.
4. Do not recommend any use case in an excluded category (listed below). For categories that are excluded but relevant to what the company asked for, add a "blockedAcknowledged" entry naming the use case that would have fit, its category, the gate, and what would unblock it.
5. Respect every warning below; they narrow what you may recommend.
6. Never issue a verdict on whether the company should adopt AI. No go/no-go language, no "you are ready for AI".
7. Tag every use case with every category from the vocabulary that applies to it. Use an empty list only if none of them applies. Tagging is checked in code; an untagged excluded use case is still a violation.
8. Return between ${range.min} and ${range.max} use cases.
9. Reply with exactly one JSON object matching the schema. No prose, no markdown, no code fences.

How to read the assessment's fields (so you do not misread them):
- "contribution": points a dimension adds to the weighted average. Large means strong.
- "bottleneck": the dimension losing the most points of the weighted average ("weightedShortfall"). Descriptive only.
- "sensitivity": for each dimension, how much the headline would rise if that dimension were raised to adequate (${SENSITIVITY_TARGET}/100). A LARGER delta means a WEAKER dimension. It is never a measure of strength; a dimension at the top of this list is the weak link, not something to build on.

Dimensions (id, exact name, what it measures):
${dimensionBlock()}

Fix-first rule:
${fixFirstRule(fixFirst)}

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
    'Deterministic assessment (computed in code; do not recompute or restate):',
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

  return { system, user: sections.join('\n\n'), nudge, fixture, range, fixFirst, fixtureTitle: fixture?.title ?? null };
}

export function repairInstruction(errors: readonly string[], range: UseCaseRange): string {
  return `Your previous reply could not be used: it broke the rules in the system prompt.
Problems found:
${errors.slice(0, 12).map((e) => `- ${e}`).join('\n')}

Reply again with exactly one JSON object that matches the schema and follows every rule in the system prompt, with ${range.min}-${range.max} use cases. No prose, no markdown, no code fences.`;
}
