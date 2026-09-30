/**
 * Runtime validation of the model's reply against `ModelResponse`. The model's output is
 * untrusted input: it is parsed, checked field by field, and rebuilt from known keys only,
 * so nothing the model adds beyond the schema can reach the UI.
 *
 * Structured output (Fix 4) makes shape failures rare, but this stays: the API does not
 * enforce item counts or enum casing, and the cross-field rules below are not expressible
 * in a JSON Schema at all.
 *
 * Cross-field rules (checked only once the shape is valid, so repair messages stay focused):
 *   - the pilot's title is one of the returned use cases (or the injected fixture), ignoring
 *     case, quotes, spacing and trailing punctuation; roadmap titles are mapped to the exact one;
 *   - the prerequisite names the fix-first dimension, or is null when there is none (Fix 1);
 *   - every dimension id in text the reader sees carries its exact name, after or before the
 *     id, any case, "&" or "and" (Fix 1).
 *     The v1.0 run called D4 "process maturity" and D6 "oversight"; this catches that class.
 *
 * Word limits (<= 40 / 25 / 30) are prompt instructions, not validation failures: a
 * 42-word description is still a usable recommendation, and failing it would burn the one
 * retry on style rather than structure.
 */
import { dimensions } from '../data/questionBank';
import type {
  BlockedAcknowledgement, DimensionId, GovernanceFlag, ModelResponse, ModelUseCase, Roadmap, UseCaseCategory,
} from '../data/types';
import type { ReplyContract } from './prompt';
import {
  canonicalOf, DIMENSION_IDS, GATE_IDS, GOVERNANCE_FLAG_TYPES, IMPLEMENTATION_RISK, OUTCOME_CONFIDENCE, USE_CASE_CATEGORIES,
} from './vocabulary';

/** Model-supplied values echoed in error messages are cut short; errors are shown on the page. */
const shown = (v: unknown): string => {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
};

export type ValidationResult =
  | { readonly ok: true; readonly value: ModelResponse }
  | { readonly ok: false; readonly errors: readonly string[] };

type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Pulls the JSON object out of a reply, tolerating a code fence or stray text around it. */
export function extractJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return { ok: false, error: 'reply contains no JSON object' };
  try {
    return { ok: true, value: JSON.parse(candidate.slice(start, end + 1)) as unknown };
  } catch (e) {
    return { ok: false, error: `reply is not valid JSON (${e instanceof Error ? e.message : 'parse error'})` };
  }
}

class Collector {
  readonly errors: string[] = [];
  str(o: Obj, key: string, at: string): string {
    const v = o[key];
    if (typeof v !== 'string' || v.trim() === '') { this.errors.push(`${at}.${key} must be a non-empty string`); return ''; }
    return v;
  }
  strOrNull(o: Obj, key: string, at: string): string | null {
    const v = o[key];
    if (v === null) return null;
    if (typeof v !== 'string') { this.errors.push(`${at}.${key} must be a string or null`); return null; }
    return v;
  }
  oneOf<T extends string>(o: Obj, key: string, set: readonly T[], at: string): T {
    const v = o[key];
    const canonical = canonicalOf(set, v);
    if (canonical === undefined) { this.errors.push(`${at}.${key} must be one of: ${set.join(', ')} (got ${shown(v)})`); return set[0] as T; }
    return canonical;
  }
  arr(o: Obj, key: string, at: string): readonly unknown[] {
    const v = o[key];
    if (!Array.isArray(v)) { this.errors.push(`${at}.${key} must be an array`); return []; }
    return v as readonly unknown[];
  }
  obj(v: unknown, at: string): Obj {
    if (!isObj(v)) { this.errors.push(`${at} must be an object`); return {}; }
    return v;
  }
}

function useCase(c: Collector, raw: unknown, at: string): ModelUseCase {
  const o = c.obj(raw, at);
  const categories = c.arr(o, 'categories', at).flatMap((v, i): UseCaseCategory[] => {
    const canonical = canonicalOf(USE_CASE_CATEGORIES, v);
    if (canonical !== undefined) return [canonical];
    c.errors.push(`${at}.categories[${i}] ${shown(v)} is not in the category vocabulary`);
    return [];
  });
  const riskDrivers = c.arr(o, 'riskDrivers', at).flatMap((v, i) => {
    if (typeof v === 'string') return [v];
    c.errors.push(`${at}.riskDrivers[${i}] must be a string`);
    return [];
  });
  const governanceFlags = c.arr(o, 'governanceFlags', at).map((v, i): GovernanceFlag => {
    const g = c.obj(v, `${at}.governanceFlags[${i}]`);
    return { type: c.oneOf(g, 'type', GOVERNANCE_FLAG_TYPES, `${at}.governanceFlags[${i}]`), note: c.str(g, 'note', `${at}.governanceFlags[${i}]`) };
  });
  if (typeof o.isBackOfficeAlternative !== 'boolean') c.errors.push(`${at}.isBackOfficeAlternative must be a boolean`);
  return {
    title: c.str(o, 'title', at),
    description: c.str(o, 'description', at),
    categories,
    targetFunction: c.str(o, 'targetFunction', at),
    expectedOutcome: c.str(o, 'expectedOutcome', at),
    outcomeConfidence: c.oneOf(o, 'outcomeConfidence', OUTCOME_CONFIDENCE, at),
    implementationRisk: c.oneOf(o, 'implementationRisk', IMPLEMENTATION_RISK, at),
    riskDrivers,
    governanceFlags,
    dependsOnDimension: c.oneOf(o, 'dependsOnDimension', DIMENSION_IDS, at),
    isBackOfficeAlternative: o.isBackOfficeAlternative === true,
  };
}

function roadmap(c: Collector, raw: unknown): Roadmap {
  const o = c.obj(raw, 'roadmap');
  const p = c.obj(o.pilotFirst, 'roadmap.pilotFirst');
  return {
    pilotFirst: { useCaseTitle: c.str(p, 'useCaseTitle', 'roadmap.pilotFirst'), rationale: c.str(p, 'rationale', 'roadmap.pilotFirst') },
    prerequisite: c.strOrNull(o, 'prerequisite', 'roadmap'),
    defer: c.arr(o, 'defer', 'roadmap').map((v, i) => {
      const d = c.obj(v, `roadmap.defer[${i}]`);
      return { useCaseTitle: c.str(d, 'useCaseTitle', `roadmap.defer[${i}]`), until: c.str(d, 'until', `roadmap.defer[${i}]`) };
    }),
  };
}

function blocked(c: Collector, raw: unknown, at: string): BlockedAcknowledgement {
  const o = c.obj(raw, at);
  return {
    title: c.str(o, 'title', at),
    description: c.str(o, 'description', at),
    useCaseCategory: c.oneOf(o, 'useCaseCategory', USE_CASE_CATEGORIES, at),
    gateId: c.oneOf(o, 'gateId', GATE_IDS, at),
    unblockCondition: c.str(o, 'unblockCondition', at),
  };
}

const NAMES: Readonly<Record<DimensionId, string>> = Object.fromEntries(dimensions.map((d) => [d.id, d.name])) as Record<DimensionId, string>;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A dimension's exact name as a pattern: any case, "&" or "and". */
const namePattern = (id: DimensionId) => escapeRe(NAMES[id]).replace(/\s*&\s*/g, '\\s*(?:&|and)\\s*').replace(/ /g, '\\s+');
const SEP = '[\\s:(),\\-\u2013\u2014]*';
/** "D2" followed by its name ("D2 Integration architecture", "D2: …", "D2 (…)"). */
const NAME_AFTER: Readonly<Record<DimensionId, RegExp>> = Object.fromEntries(
  DIMENSION_IDS.map((id) => [id, new RegExp(`^${SEP}${namePattern(id)}`, 'i')]),
) as Record<DimensionId, RegExp>;
/** "D2" preceded by its name ("Integration architecture (D2)"). */
const NAME_BEFORE: Readonly<Record<DimensionId, RegExp>> = Object.fromEntries(
  DIMENSION_IDS.map((id) => [id, new RegExp(`${namePattern(id)}${SEP}$`, 'i')]),
) as Record<DimensionId, RegExp>;

/** Every "Dn" in `text` must carry that dimension's exact name, after or before it. One error per id per field. */
function checkDimensionReferences(text: string | null, at: string, errors: string[]): void {
  if (text === null) return;
  const bad = new Set<DimensionId>();
  for (const m of text.matchAll(/\bD([1-6])\b/g)) {
    const id = `D${m[1] ?? ''}` as DimensionId;
    const start = m.index ?? 0;
    const ok = NAME_AFTER[id].test(text.slice(start + m[0].length)) || NAME_BEFORE[id].test(text.slice(0, start));
    if (!ok) bad.add(id);
  }
  for (const id of bad) errors.push(`${at} refers to ${id} without its exact name; write it as "${id} ${NAMES[id]}"`);
}

/** Title comparison that ignores case, quotes, spacing and trailing punctuation. */
const titleKey = (t: string) => t.normalize('NFKC').replace(/["'`\u2018\u2019\u201C\u201D]/g, '').replace(/\s+/g, ' ').trim()
  .replace(/[.!;:,]+$/, '').toLowerCase();

/**
 * Cross-field rules. Returns the errors and the response with roadmap titles mapped to the
 * exact use-case (or fixture) title they match, so the gate check compares like with like.
 */
function crossField(r: ModelResponse, contract: ReplyContract): { errors: string[]; value: ModelResponse } {
  const errors: string[] = [];

  const titles = [...r.useCases.map((u) => u.title), ...(contract.fixtureTitle === null ? [] : [contract.fixtureTitle])];
  const canonical = new Map(titles.map((t) => [titleKey(t), t]));
  const pilotTitle = canonical.get(titleKey(r.roadmap.pilotFirst.useCaseTitle));
  if (pilotTitle === undefined) {
    errors.push(`roadmap.pilotFirst.useCaseTitle ${shown(r.roadmap.pilotFirst.useCaseTitle)} is not exactly the title of one of your useCases`);
  }
  const value: ModelResponse = {
    ...r,
    roadmap: {
      ...r.roadmap,
      pilotFirst: { ...r.roadmap.pilotFirst, useCaseTitle: pilotTitle ?? r.roadmap.pilotFirst.useCaseTitle },
      defer: r.roadmap.defer.map((d) => ({ ...d, useCaseTitle: canonical.get(titleKey(d.useCaseTitle)) ?? d.useCaseTitle })),
    },
  };

  const { fixFirst } = contract;
  if (fixFirst === null && r.roadmap.prerequisite !== null) {
    errors.push('roadmap.prerequisite must be null: no dimension is below adequate, so there is nothing to fix first');
  }
  if (fixFirst !== null && (r.roadmap.prerequisite === null || !new RegExp(`\\b${fixFirst}\\b`).test(r.roadmap.prerequisite))) {
    errors.push(`roadmap.prerequisite must name the dimension to fix first, written as "${fixFirst} ${NAMES[fixFirst]}"`);
  }

  r.useCases.forEach((u, i) => {
    const at = `useCases[${i}]`;
    for (const [k, v] of [['title', u.title], ['description', u.description], ['targetFunction', u.targetFunction], ['expectedOutcome', u.expectedOutcome]] as const) {
      checkDimensionReferences(v, `${at}.${k}`, errors);
    }
    u.riskDrivers.forEach((d, j) => checkDimensionReferences(d, `${at}.riskDrivers[${j}]`, errors));
    u.governanceFlags.forEach((g, j) => checkDimensionReferences(g.note, `${at}.governanceFlags[${j}].note`, errors));
  });
  checkDimensionReferences(r.roadmap.pilotFirst.rationale, 'roadmap.pilotFirst.rationale', errors);
  checkDimensionReferences(r.roadmap.prerequisite, 'roadmap.prerequisite', errors);
  r.roadmap.defer.forEach((d, i) => checkDimensionReferences(d.until, `roadmap.defer[${i}].until`, errors));
  r.blockedAcknowledged.forEach((b, i) => {
    for (const [k, v] of [['title', b.title], ['description', b.description], ['unblockCondition', b.unblockCondition]] as const) {
      checkDimensionReferences(v, `blockedAcknowledged[${i}].${k}`, errors);
    }
  });
  return { errors, value };
}

export function validateModelResponse(raw: unknown, contract: ReplyContract): ValidationResult {
  const { range } = contract;
  const c = new Collector();
  const o = c.obj(raw, 'response');
  const useCases = c.arr(o, 'useCases', 'response').map((v, i) => useCase(c, v, `useCases[${i}]`));
  if (useCases.length < range.min || useCases.length > range.max) {
    c.errors.push(`useCases must have ${range.min}-${range.max} entries (got ${useCases.length})`);
  }
  const value: ModelResponse = {
    scoreNarrative: c.str(o, 'scoreNarrative', 'response'),
    imbalanceNote: c.strOrNull(o, 'imbalanceNote', 'response'),
    useCases,
    roadmap: roadmap(c, o.roadmap),
    blockedAcknowledged: c.arr(o, 'blockedAcknowledged', 'response').map((v, i) => blocked(c, v, `blockedAcknowledged[${i}]`)),
  };
  if (c.errors.length > 0) return { ok: false, errors: c.errors };
  const cross = crossField(value, contract);
  return cross.errors.length === 0 ? { ok: true, value: cross.value } : { ok: false, errors: cross.errors };
}

/** Text in, validated response out. `stopReason` explains a cut-off or refused reply. */
export function parseModelReply(text: string, contract: ReplyContract, stopReason: string | null = null): ValidationResult {
  const json = extractJson(text);
  if (json.ok) return validateModelResponse(json.value, contract);
  const why = stopReason === 'max_tokens' ? ' (the reply was cut off at the token limit)'
    : stopReason === 'refusal' ? ' (the model declined to answer)' : '';
  return { ok: false, errors: [json.error + why] };
}
