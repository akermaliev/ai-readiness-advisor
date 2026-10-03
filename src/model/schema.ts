/**
 * `ModelResponse` as a JSON Schema, sent through the Messages API's structured-output option
 * (`output_config.format`, GA; supported by every model offered in the picker) so the reply is
 * constrained to valid JSON of the right shape at decode time (v1.1, Fix 4).
 *
 * Built from the same closed sets the validator uses (vocabulary.ts), so the schema and the
 * validator cannot drift apart.
 *
 * What the schema cannot say, and the validator still checks (validate.ts):
 *   - how many use cases (minItems/maxItems are not enforced by the API)
 *   - that the pilot's title is one of the use cases, that the prerequisite names the
 *     fix-first dimension, that dimensions are referred to by id plus exact name
 *   - enum casing (the API does not guarantee it; the validator matches case-insensitively)
 * Word limits and gate rules stay prompt instructions and a code check respectively.
 *
 * API constraints respected here: every object has `additionalProperties: false` and lists
 * every property as required (no optional parameters); three union-typed fields (well under 16).
 */
import {
  DIMENSION_IDS, GATE_IDS, GOVERNANCE_FLAG_TYPES, IMPLEMENTATION_RISK, OUTCOME_CONFIDENCE, QUESTION_IDS, USE_CASE_CATEGORIES,
} from './vocabulary';

type JsonSchema = Readonly<Record<string, unknown>>;

const str: JsonSchema = { type: 'string' };
const nullableStr: JsonSchema = { type: ['string', 'null'] };
const enumOf = (values: readonly string[]): JsonSchema => ({ type: 'string', enum: [...values] });
const object = (properties: Readonly<Record<string, JsonSchema>>): JsonSchema => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const arrayOf = (items: JsonSchema): JsonSchema => ({ type: 'array', items });

const useCase = object({
  title: str,
  description: str,
  categories: arrayOf(enumOf(USE_CASE_CATEGORIES)),
  targetFunction: str,
  expectedOutcome: str,
  outcomeConfidence: enumOf(OUTCOME_CONFIDENCE),
  implementationRisk: enumOf(IMPLEMENTATION_RISK),
  riskDrivers: arrayOf(str),
  governanceFlags: arrayOf(object({ type: enumOf(GOVERNANCE_FLAG_TYPES), note: str })),
  dependsOnDimension: enumOf(DIMENSION_IDS),
  isBackOfficeAlternative: { type: 'boolean' },
});

export const MODEL_RESPONSE_SCHEMA: JsonSchema = object({
  scoreNarrative: str,
  imbalanceNote: nullableStr,
  useCases: arrayOf(useCase),
  roadmap: object({
    // v1.3: success measure, stop condition, goal note; deferrals name the answers that unlock them.
    pilotFirst: object({ useCaseTitle: str, rationale: str, successMeasure: str, stopCondition: str, goalNote: nullableStr }),
    prerequisite: nullableStr,
    defer: arrayOf(object({ useCaseTitle: str, until: str, unlockAnswers: arrayOf(enumOf(QUESTION_IDS)) })),
  }),
  blockedAcknowledged: arrayOf(object({
    title: str,
    description: str,
    useCaseCategory: enumOf(USE_CASE_CATEGORIES),
    gateId: enumOf(GATE_IDS),
    unblockCondition: str,
  })),
});

/** The request field that carries the schema. */
export const OUTPUT_CONFIG = { format: { type: 'json_schema', schema: MODEL_RESPONSE_SCHEMA } } as const;
