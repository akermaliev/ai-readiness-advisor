/**
 * Runtime validation of the model's reply against `ModelResponse`. The model's output is
 * untrusted input: it is parsed, checked field by field, and rebuilt from known keys only,
 * so nothing the model adds beyond the schema can reach the UI.
 *
 * Word limits (<= 60 / 40 / 25 / 30) are prompt instructions, not validation failures: a
 * 42-word description is still a usable recommendation, and failing it would burn the one
 * retry on style rather than structure.
 */
import type {
  BlockedAcknowledgement, GovernanceFlag, ModelResponse, ModelUseCase, Roadmap, UseCaseCategory,
} from '../data/types';
import type { UseCaseRange } from './prompt';
import {
  DIMENSION_IDS, GATE_IDS, GOVERNANCE_FLAG_TYPES, IMPLEMENTATION_RISK, isOneOf, OUTCOME_CONFIDENCE, USE_CASE_CATEGORIES,
} from './vocabulary';

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
    if (!isOneOf(set, v)) { this.errors.push(`${at}.${key} must be one of: ${set.join(', ')} (got ${JSON.stringify(v)})`); return set[0] as T; }
    return v;
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
    if (isOneOf(USE_CASE_CATEGORIES, v)) return [v];
    c.errors.push(`${at}.categories[${i}] ${JSON.stringify(v)} is not in the category vocabulary`);
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

export function validateModelResponse(raw: unknown, range: UseCaseRange): ValidationResult {
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
  return c.errors.length === 0 ? { ok: true, value } : { ok: false, errors: c.errors };
}

/** Text in, validated response out. */
export function parseModelReply(text: string, range: UseCaseRange): ValidationResult {
  const json = extractJson(text);
  return json.ok ? validateModelResponse(json.value, range) : { ok: false, errors: [json.error] };
}
