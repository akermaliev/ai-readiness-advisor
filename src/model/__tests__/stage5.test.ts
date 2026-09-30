import { describe, expect, it } from 'vitest';
import { FLAT_SENSITIVITY_MAX_DELTA, SENSITIVITY_TARGET } from '../../data/bands';
import { calibrationPersonas } from '../../data/calibrationPersonas';
import { dimensions } from '../../data/questionBank';
import type { ModelResponse, ModelUseCase, ProblemStatement, ReadinessInput, ScoringOutput } from '../../data/types';
import { computeReadiness } from '../../engine';
import { dimensionLabel } from '../../report/lookups';
import { createAnthropicTransport, type MessagesRequest, type Transport, type TransportResult } from '../client';
import { buildFallbackRecommendations } from '../fallback';
import { buildRecommendationPrompt, type ReplyContract, type UseCaseRange } from '../prompt';
import { requestRecommendations } from '../recommend';
import { MODEL_RESPONSE_SCHEMA, OUTPUT_CONFIG } from '../schema';
import { deterministicSummary, fixFirstDimension } from '../summary';
import { parseModelReply } from '../validate';
import { DIMENSION_IDS, GATE_IDS, USE_CASE_CATEGORIES } from '../vocabulary';

const persona = (id: string): ReadinessInput => {
  const p = calibrationPersonas.find((x) => x.id === id);
  if (p === undefined) throw new Error(id);
  return p.input;
};
// Weak retailer: Q2.3 = 0 -> G-U1 BLOCKS retrieval-over-internal-content; Q4.1 = 0 -> G-R1 warns.
const WEAK = computeReadiness(persona('weak'));
// Median manufacturer: no gate fires. Fix-first dimension: D1.
const MEDIAN = computeReadiness(persona('median'));
// Strong bank: fix-first D2, and a flat ranking (+2, +1, +1).
const STRONG = computeReadiness(persona('strong'));
const NUDGE: ProblemStatement = { primaryBottleneck: 'repetitive-analysis-reporting', targetFunction: 'sales-marketing' };
const NO_NUDGE: ProblemStatement = { primaryBottleneck: 'forecasting-planning', targetFunction: 'supply-chain' };

const uc = (title: string, categories: ModelUseCase['categories'], dependsOnDimension: ModelUseCase['dependsOnDimension'] = 'D3'): ModelUseCase => ({
  title, description: `${title} description`, categories, targetFunction: 'operations',
  expectedOutcome: 'Faster cycle time.', outcomeConfidence: 'medium', implementationRisk: 'low',
  riskDrivers: ['data quality'], governanceFlags: [{ type: 'reliability', note: 'Human review.' }],
  dependsOnDimension, isBackOfficeAlternative: false,
});
/** A contract-compliant reply for `output`: the prerequisite names its fix-first dimension. */
const response = (useCases: ModelUseCase[], extra: Partial<ModelResponse> = {}, output: ScoringOutput = MEDIAN): ModelResponse => {
  const fixFirst = fixFirstDimension(output);
  return {
    scoreNarrative: 'Held back by data maturity.', imbalanceNote: null, useCases,
    roadmap: { pilotFirst: { useCaseTitle: useCases[0]?.title ?? '', rationale: 'Lowest risk.' },
      prerequisite: fixFirst === null ? null : `Close the gap in ${dimensionLabel(fixFirst)} first.`,
      defer: useCases.slice(1).map((u) => ({ useCaseTitle: u.title, until: 'later' })) },
    blockedAcknowledged: [], ...extra,
  };
};
/** A contract for validator-only tests: MEDIAN's fix-first dimension, no fixture. */
const contract = (range: UseCaseRange, fixFirst: ReplyContract['fixFirst'] = 'D1'): ReplyContract => ({ range, fixFirst, fixtureTitle: null });

/** A transport that replays canned replies and records every request it receives. */
function mockTransport(replies: TransportResult[]): Transport & { calls: MessagesRequest[] } {
  const calls: MessagesRequest[] = [];
  const t = async (req: MessagesRequest): Promise<TransportResult> => {
    calls.push(req);
    const next = replies.shift();
    if (next === undefined) throw new Error('mock transport: no reply queued');
    return next;
  };
  return Object.assign(t, { calls });
}
const reply = (body: unknown, stopReason: string | null = 'end_turn'): TransportResult =>
  ({ ok: true, text: typeof body === 'string' ? body : JSON.stringify(body), stopReason });

const WELL_FORMED = response([uc('Demand forecasting', []), uc('Invoice matching', ['entity-resolution'])]);
const MALFORMED = 'Sure! Here are my recommendations: {"scoreNarrative": "Held back by", "useCases": [';
const GATE_VIOLATING = response([
  uc('Internal knowledge assistant', ['retrieval-over-internal-content']), // G-U1 blocks this for WEAK
  uc('Email personalization', ['personalization-targeting']),              // G-R1 only warns: kept
], {}, WEAK);

describe('prompt builder', () => {
  it('serializes the full ScoringOutput and the problem statement — and not the rubric answers', () => {
    const p = buildRecommendationPrompt(MEDIAN, NO_NUDGE);
    expect(p.user).toContain(JSON.stringify(MEDIAN, null, 2));
    expect(p.user).toContain(JSON.stringify(NO_NUDGE, null, 2));
    expect(p.user).not.toMatch(/rubricAnswers|"\d\.\d":/);
  });
  it('passes blocked gates as an exclusion list and warnings as constraints', () => {
    const p = buildRecommendationPrompt(WEAK, NUDGE);
    expect(p.system).toContain('G-U1 excludes retrieval-over-internal-content');
    expect(p.system).toMatch(/G-R1 \(severe\)/);
  });
  it('nudge active: asks the model for 2-3 use cases and includes the fixture so it is not duplicated', () => {
    const p = buildRecommendationPrompt(WEAK, NUDGE);
    expect(p.range).toEqual({ min: 2, max: 3 });
    expect(p.fixture?.isBackOfficeAlternative).toBe(true);
    expect(p.user).toContain('<back_office_alternative>');
  });
  it('nudge inactive: 2-4 use cases and no fixture', () => {
    const p = buildRecommendationPrompt(MEDIAN, NO_NUDGE);
    expect(p.range).toEqual({ min: 2, max: 4 });
    expect(p.fixture).toBeNull();
    expect(p.user).not.toContain('<back_office_alternative>');
  });
});

describe('mocked response 1 — well-formed', () => {
  it('renders as live recommendations after a single call', async () => {
    const t = mockTransport([reply(WELL_FORMED)]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'claude-sonnet-5' });
    expect(out.kind).toBe('live');
    if (out.kind !== 'live') return;
    expect(out.attempts).toBe(1);
    expect(out.result.useCases.map((u) => u.useCase.title)).toEqual(['Demand forecasting', 'Invoice matching']);
    expect(out.result.blocked).toEqual([]);
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]?.model).toBe('claude-sonnet-5');
  });
  it('tolerates a code fence around the JSON', async () => {
    const t = mockTransport([reply('```json\n' + JSON.stringify(WELL_FORMED) + '\n```')]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'm' });
    expect(out.kind).toBe('live');
  });
});

describe('mocked response 2 — malformed', () => {
  it('retries once with a repair instruction, then gives up (-> fallback)', async () => {
    const t = mockTransport([reply(MALFORMED), reply(MALFORMED)]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'm' });
    expect(out.kind).toBe('invalid-response');
    expect(t.calls).toHaveLength(2);
    const retry = t.calls[1]?.messages ?? [];
    expect(retry.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(retry[1]?.content).toBe(MALFORMED);
    expect(retry[2]?.content).toMatch(/could not be used[\s\S]*(no JSON object|not valid JSON)/);
  });
  it('a reply with braces but broken JSON is reported as invalid JSON', () => {
    const r = parseModelReply('{"scoreNarrative": "x", }', contract({ min: 2, max: 4 }));
    expect(!r.ok && r.errors[0]).toMatch(/not valid JSON/);
  });
  it('recovers when the retry is valid', async () => {
    const t = mockTransport([reply(MALFORMED), reply(WELL_FORMED)]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'm' });
    expect(out.kind === 'live' && out.attempts).toBe(2);
  });
  it('schema violations are malformed too: bad enum, unknown category, wrong count', () => {
    const bad = { ...WELL_FORMED, useCases: [{ ...uc('A', []), outcomeConfidence: 'certain' }, { ...uc('B', []), categories: ['blockchain'] }] };
    const r = parseModelReply(JSON.stringify(bad), contract({ min: 2, max: 4 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toMatch(/outcomeConfidence must be one of/);
    expect(r.errors.join('\n')).toMatch(/"blockchain" is not in the category vocabulary/);
    expect(parseModelReply(JSON.stringify(response([uc('only one', [])])), contract({ min: 2, max: 4 })).ok).toBe(false);
  });
  it('strips keys the schema does not define', () => {
    const r = parseModelReply(JSON.stringify({ ...WELL_FORMED, verdict: 'You are ready for AI' }), contract({ min: 2, max: 4 }));
    expect(r.ok && 'verdict' in r.value).toBe(false);
  });
});

describe('mocked response 3 — gate-violating', () => {
  it('drops the violating use case client-side and records the drop with gate and unblock condition', async () => {
    const t = mockTransport([reply(GATE_VIOLATING)]);
    const out = await requestRecommendations({ output: WEAK, problem: NO_NUDGE, transport: t, model: 'm' });
    expect(out.kind).toBe('live');
    if (out.kind !== 'live') return;
    expect(out.result.useCases.map((u) => u.useCase.title)).toEqual(['Email personalization']);
    expect(out.result.dropped).toEqual(['Internal knowledge assistant']);
    expect(out.result.blocked).toEqual([{
      title: 'Internal knowledge assistant', description: 'Internal knowledge assistant description',
      useCaseCategory: 'retrieval-over-internal-content', gateId: 'G-U1',
      unblockCondition: expect.stringMatching(/Audit access permissions/) as string, source: 'client-check',
    }]);
    expect(out.result.pilotBlocked).toBe(true); // the model's pilot was the dropped use case
    expect(out.result.roadmap.defer.map((d) => d.useCaseTitle)).toEqual(['Email personalization']);
  });
  it('keeps model acknowledgements only when the gate is really blocked for that category', async () => {
    const withAcks = response([uc('Forecasting', []), uc('Reporting', [])], { blockedAcknowledged: [
      { title: 'Knowledge assistant', description: 'd', useCaseCategory: 'retrieval-over-internal-content', gateId: 'G-U1', unblockCondition: 'u' },
      { title: 'Loan scoring', description: 'd', useCaseCategory: 'credit-pricing-underwriting-eligibility', gateId: 'G-F1', unblockCondition: 'u' },
    ] }, WEAK);
    const t = mockTransport([reply(withAcks)]);
    const out = await requestRecommendations({ output: WEAK, problem: NO_NUDGE, transport: t, model: 'm' });
    expect(out.kind === 'live' && out.result.blocked.map((b) => b.gateId)).toEqual(['G-U1']);
  });
});

describe('back-office nudge', () => {
  it('a gated fixture is surfaced in blockedAcknowledged with title, description, gate and unblock — never dropped silently', async () => {
    const t = mockTransport([reply(response([uc('Email personalization', ['personalization-targeting']), uc('Demand forecasting', [])], {}, WEAK))]);
    const out = await requestRecommendations({ output: WEAK, problem: NUDGE, transport: t, model: 'm' });
    if (out.kind !== 'live') throw new Error(out.kind);
    expect(out.result.useCases.some((u) => u.source === 'fixture')).toBe(false);
    const fixtureBlock = out.result.blocked.filter((b) => b.source === 'fixture');
    expect(fixtureBlock).toHaveLength(1); // retrieval (G-U1); entity-resolution is not blocked for WEAK
    expect(fixtureBlock[0]).toMatchObject({ title: 'Supplier invoice and returns documentation triage', gateId: 'G-U1' });
    expect(fixtureBlock[0]?.description.length).toBeGreaterThan(0);
    expect(fixtureBlock[0]?.unblockCondition.length).toBeGreaterThan(0);
  });
  it('an ungated fixture is injected after the model\'s 2-3 use cases, with its tradeoff, and the total stays <= 4', async () => {
    const three = response([uc('A', []), uc('B', []), uc('C', [])]);
    const t = mockTransport([reply(three)]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NUDGE, transport: t, model: 'm' });
    if (out.kind !== 'live') throw new Error(out.kind);
    expect(out.result.useCases).toHaveLength(4);
    const last = out.result.useCases.at(-1);
    expect(last?.source).toBe('fixture');
    expect(last?.useCase.isBackOfficeAlternative).toBe(true);
    expect(last?.tradeoff).toMatch(/quieter story/);
  });
  it('rejects a fourth model use case when the nudge is active', () => {
    expect(parseModelReply(JSON.stringify(response([uc('A', []), uc('B', []), uc('C', []), uc('D', [])])), contract({ min: 2, max: 3 })).ok).toBe(false);
  });
});

describe('request failures', () => {
  it('HTTP error: reported, not retried (the retry is for invalid JSON only)', async () => {
    const t = mockTransport([{ ok: false, kind: 'http', status: 401, message: 'invalid x-api-key' }]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'm' });
    expect(out).toMatchObject({ kind: 'request-failed', reason: 'http', status: 401, attempts: 1 });
    expect(t.calls).toHaveLength(1);
  });
});

describe('Anthropic transport', () => {
  const KEY = 'sk-ant-test-0123456789';
  it('posts to api.anthropic.com with the key only in x-api-key, plus the browser-access header', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url); seenInit = init;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"ok":1}' }], stop_reason: 'end_turn' }), { status: 200 });
    }) as typeof fetch;
    const r = await createAnthropicTransport(KEY, { fetchImpl: fakeFetch })({ model: 'm', max_tokens: 10, system: 's', messages: [], output_config: OUTPUT_CONFIG });
    expect(r).toEqual({ ok: true, text: '{"ok":1}', stopReason: 'end_turn' });
    expect(JSON.parse(String(seenInit?.body)).output_config).toEqual(OUTPUT_CONFIG);
    expect(seenUrl).toBe('https://api.anthropic.com/v1/messages');
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(KEY);
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(String(seenInit?.body)).not.toContain(KEY);
  });
  it('surfaces the API\'s error message without echoing the key', async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 })) as typeof fetch;
    const r = await createAnthropicTransport(KEY, { fetchImpl: fakeFetch })({ model: 'm', max_tokens: 10, system: 's', messages: [] });
    expect(r).toMatchObject({ ok: false, kind: 'http', status: 401, message: 'invalid x-api-key' });
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
  it('times out instead of hanging', async () => {
    const hang = ((_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as typeof fetch;
    const r = await createAnthropicTransport(KEY, { fetchImpl: hang, timeoutMs: 20 })({ model: 'm', max_tokens: 10, system: 's', messages: [] });
    expect(r).toMatchObject({ ok: false, kind: 'timeout' });
  });
});

describe('fallback (no key)', () => {
  it('goes through the same gate verification: the weak retailer\'s retrieval example is dropped and acknowledged', () => {
    const r = buildFallbackRecommendations(WEAK, NUDGE);
    expect(r.dropped).toEqual(['Product description drafting']);
    expect(r.blocked.some((b) => b.source === 'fixture' && b.gateId === 'G-U1')).toBe(true);
    expect(r.useCases.length).toBeGreaterThanOrEqual(1);
    expect(r.useCases.length).toBeLessThanOrEqual(4);
    expect(r.pilotBlocked).toBe(false); // the templated pilot is the first unblocked example
  });
  it('shows the deterministic summary, which states the visitor\'s real numbers', () => {
    const r = buildFallbackRecommendations(MEDIAN, NO_NUDGE);
    expect(r.summary).toEqual(deterministicSummary(MEDIAN));
    const text = r.summary.sentences.join(' ');
    expect(text).toContain(`headline score is ${MEDIAN.scoreGeometric}`);
    const top = MEDIAN.sensitivity[0];
    expect(text).toContain(`from ${MEDIAN.scoreGeometric} to ${MEDIAN.scoreGeometric + (top?.delta ?? 0)}`);
  });
  it('Fix 1: the fallback pilot avoids the fix-first dimension when an alternative exists', () => {
    // MEDIAN's fix-first is D1. Manufacturing examples: predictive maintenance (D1, listed first,
    // unblocked for MEDIAN), demand forecasting (D1), defect classification (D2).
    expect(fixFirstDimension(MEDIAN)).toBe('D1');
    const r = buildFallbackRecommendations(MEDIAN, NO_NUDGE);
    expect(r.roadmap.pilotFirst.useCaseTitle).toBe('Defect classification at inspection stations');
    expect(r.pilotDependsOnFixFirst).toBeNull();
    expect(r.roadmap.prerequisite).toContain('D1 Data maturity & accessibility');
  });
  it('Fix 1: with no alternative, the fallback keeps an unblocked pilot and flags the dependency', () => {
    // WEAK's fix-first is D1 and both unblocked retail examples depend on D1.
    const r = buildFallbackRecommendations(WEAK, NO_NUDGE);
    expect(r.pilotBlocked).toBe(false);
    expect(r.pilotDependsOnFixFirst).toBe('D1');
  });
});

describe('Fix 1 — dimension names and the fix-first rule', () => {
  it('the system prompt carries all six dimensions with id, exact name and what each measures', () => {
    const { system } = buildRecommendationPrompt(MEDIAN, NO_NUDGE);
    for (const d of dimensions) expect(system).toContain(`- ${d.id} ${d.name}: ${d.measures}.`);
    expect(system).toMatch(/refer to a dimension only as its id plus its exact name/i);
  });
  it.each(calibrationPersonas.map((p) => [p.id, p.input] as const))('names the fix-first dimension for the %s persona', (_id, input) => {
    const out = computeReadiness(input);
    const p = buildRecommendationPrompt(out, NO_NUDGE);
    const fixFirst = out.sensitivity.find((s) => s.delta > 0)?.dimensionId ?? null;
    expect(p.fixFirst).toBe(fixFirst);
    if (fixFirst === null) expect(p.system).toMatch(/Set "roadmap\.prerequisite" to null/);
    else {
      expect(p.system).toContain(`The dimension to fix first is ${dimensionLabel(fixFirst)}`);
      expect(p.system).toContain(`"dependsOnDimension" is NOT ${fixFirst}`);
    }
  });
  it('no fix-first dimension: the prompt asks for a null prerequisite, and the validator enforces it', () => {
    const allAdequate: ScoringOutput = { ...MEDIAN, sensitivity: MEDIAN.sensitivity.map((s) => ({ ...s, delta: 0 })) };
    const p = buildRecommendationPrompt(allAdequate, NO_NUDGE);
    expect(p.fixFirst).toBeNull();
    const withPrereq = response([uc('A', []), uc('B', [])]); // names D1
    const r = parseModelReply(JSON.stringify(withPrereq), p);
    expect(!r.ok && r.errors.join('\n')).toMatch(/prerequisite must be null/);
    expect(parseModelReply(JSON.stringify(response([uc('A', []), uc('B', [])], {}, allAdequate)), p).ok).toBe(true);
  });
  it('a mocked reply whose pilot depends on the fix-first dimension produces the note', async () => {
    const reply1 = response([uc('Supplier master cleanup', [], 'D1'), uc('Invoice matching', [], 'D3')]);
    const t = mockTransport([reply(reply1)]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'm' });
    if (out.kind !== 'live') throw new Error(out.kind);
    expect(out.result.pilotDependsOnFixFirst).toBe('D1');
    expect(out.result.useCases.map((u) => u.useCase.title)).toContain('Supplier master cleanup'); // flagged, not dropped
  });
  it('a pilot on a different dimension produces no note', async () => {
    const t = mockTransport([reply(response([uc('Invoice matching', [], 'D3'), uc('Supplier master cleanup', [], 'D1')]))]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'm' });
    expect(out.kind === 'live' && out.result.pilotDependsOnFixFirst).toBeNull();
  });
  it('validator: a prerequisite that does not name the fix-first dimension is repaired', () => {
    const bad = response([uc('A', []), uc('B', [])], {});
    const r = parseModelReply(JSON.stringify({ ...bad, roadmap: { ...bad.roadmap, prerequisite: 'Improve integration.' } }), contract({ min: 2, max: 4 }));
    expect(!r.ok && r.errors.join('\n')).toMatch(/prerequisite must name the dimension to fix first, written as "D1 Data maturity & accessibility"/);
  });
  it('validator: the v1.0 errors are caught — a dimension id with the wrong meaning attached', () => {
    const cases = [
      'Score driven mainly by D4 (process maturity).',
      'Close the D2 gap (process consistency) first.',
      'Defer until D6 oversight and audit-trail practices are strengthened.',
    ];
    for (const text of cases) {
      const base = response([uc('A', []), uc('B', [])]);
      const r = parseModelReply(JSON.stringify({ ...base, roadmap: { ...base.roadmap, pilotFirst: { useCaseTitle: 'A', rationale: text } } }), contract({ min: 2, max: 4 }));
      expect(!r.ok && r.errors.join('\n'), text).toMatch(/refers to D[246] without its exact name/);
    }
  });
  it('validator: id plus exact name passes, with or without punctuation between', () => {
    const base = response([uc('A', []), uc('B', [])]);
    for (const text of ['Depends on D4 Governance & compliance.', 'Needs D2: Integration architecture.', 'See D6 (strategy & sponsorship).']) {
      const r = parseModelReply(JSON.stringify({ ...base, roadmap: { ...base.roadmap, pilotFirst: { useCaseTitle: 'A', rationale: text } } }), contract({ min: 2, max: 4 }));
      expect(r.ok, text).toBe(true);
    }
  });
  it('validator: the pilot must be one of the returned use cases, or the injected fixture', () => {
    const base = response([uc('A', []), uc('B', [])]);
    const stray = { ...base, roadmap: { ...base.roadmap, pilotFirst: { useCaseTitle: 'Something else', rationale: 'r' } } };
    const r = parseModelReply(JSON.stringify(stray), contract({ min: 2, max: 4 }));
    expect(!r.ok && r.errors.join('\n')).toMatch(/pilotFirst\.useCaseTitle "Something else" is not exactly the title/);
    const withFixture: ReplyContract = { range: { min: 2, max: 4 }, fixFirst: 'D1', fixtureTitle: 'Something else' };
    expect(parseModelReply(JSON.stringify(stray), withFixture).ok).toBe(true);
  });
});

describe('internal rehearsal regressions (2026-09-29)', () => {
  const base = () => response([uc('Weekly sales report drafting', [], 'D3'), uc('Email subject-line testing', ['personalization-targeting'], 'D1')]);
  const withPrereq = (p: string) => { const b = base(); return { ...b, roadmap: { ...b.roadmap, prerequisite: p } }; };
  it.each([
    'Close the gap in Data maturity & accessibility (D1) first.',
    'Close the gap in D1 Data maturity and accessibility first.',
    'D1 — Data maturity & accessibility: agree one customer record.',
  ])('accepts an honest phrasing of the dimension: %s', (p) => {
    const r = parseModelReply(JSON.stringify(withPrereq(p)), contract({ min: 2, max: 4 }));
    expect(r.ok ? [] : r.errors).toEqual([]);
  });
  it('still rejects a renamed dimension written name-first', () => {
    const r = parseModelReply(JSON.stringify(withPrereq('Fix process maturity (D1) first.')), contract({ min: 2, max: 4 }));
    expect(!r.ok && r.errors.join('\n')).toMatch(/refers to D1 without its exact name/);
  });
  it.each(['weekly sales report drafting', 'Weekly sales report drafting.', '\u201CWeekly sales report drafting\u201D', '  Weekly  sales report drafting '])(
    'maps a near-miss pilot title to the real one: %s', (t) => {
      const b = base();
      const r = parseModelReply(JSON.stringify({ ...b, roadmap: { ...b.roadmap, pilotFirst: { useCaseTitle: t, rationale: 'r' } } }), contract({ min: 2, max: 4 }));
      expect(r.ok ? r.value.roadmap.pilotFirst.useCaseTitle : r.errors).toBe('Weekly sales report drafting');
    });
  it('a gated fixture named as the pilot is shown as blocked, and its deferral is removed', async () => {
    const fixtureTitle = buildRecommendationPrompt(WEAK, NUDGE).fixtureTitle ?? '';
    const b = response([uc('A', [], 'D3'), uc('B', [], 'D3')], {}, WEAK);
    const r = { ...b, roadmap: { ...b.roadmap, pilotFirst: { useCaseTitle: fixtureTitle, rationale: 'r' },
      defer: [{ useCaseTitle: fixtureTitle, until: 'later' }] } };
    const out = await requestRecommendations({ output: WEAK, problem: NUDGE, transport: mockTransport([reply(r)]), model: 'm' });
    if (out.kind !== 'live') throw new Error(out.kind);
    expect(out.result.pilotBlocked).toBe(true);
    expect(out.result.roadmap.defer).toEqual([]);
  });
  it('the prompt says when the fixture is blocked, and tells the model not to relabel dependencies', () => {
    const p = buildRecommendationPrompt(WEAK, NUDGE);
    expect(p.system).toMatch(/currently blocked by G-U1, so do not choose it as the pilot/);
    expect(p.system).toMatch(/Never change it to satisfy this rule/);
    expect(buildRecommendationPrompt(MEDIAN, NUDGE).system).toMatch(/You may reference it by its exact title/);
  });
});

describe('Fix 2 — a score narrative computed in code', () => {
  const WRONG = 'Score driven mainly by D4 (process maturity); D1 contributing least at 3.2 points.';
  it('the live result\'s narrative equals deterministicSummary(output), and the model\'s never reaches the view', async () => {
    const t = mockTransport([reply(response([uc('A', []), uc('B', [])], { scoreNarrative: WRONG, imbalanceNote: 'Gap of 99 points.' }))]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'm' });
    if (out.kind !== 'live') throw new Error(out.kind);
    expect(out.result.summary).toEqual(deterministicSummary(MEDIAN));
    const rendered = JSON.stringify(out.result);
    expect(rendered).not.toContain('process maturity');
    expect(rendered).not.toContain('3.2 points');
    expect(rendered).not.toContain('99 points');
  });
  it.each(calibrationPersonas.map((p) => [p.id, p.input] as const))('%s: every number in the summary is read from ScoringOutput', (_id, input) => {
    const out = computeReadiness(input);
    const s = deterministicSummary(out);
    const text = [...s.sentences, s.flatNote ?? '', s.imbalanceNote ?? ''].join(' ');
    const allowed = new Set<string>([
      String(out.scoreGeometric), String(out.scoreArithmetic), String(out.compensationGap),
      String(out.band.lower), String(out.band.upper),
      ...out.dimensions.map((d) => d.contribution.toFixed(1)),
      out.bottleneck.weightedShortfall.toFixed(1),
      ...out.sensitivity.map((x) => String(out.scoreGeometric + x.delta)),
      String(SENSITIVITY_TARGET), String(FLAT_SENSITIVITY_MAX_DELTA), '100',
      ...DIMENSION_IDS.map((id) => id.slice(1)), // the digit in "D4"
    ]);
    const numbers = text.match(/\d+(?:\.\d+)?/g) ?? [];
    expect(numbers.length).toBeGreaterThan(4);
    for (const n of numbers) expect(allowed, `${n} in: ${text}`).toContain(n);
    // The four required statements.
    expect(s.sentences[0]).toContain(`${out.scoreGeometric}`);
    expect(text).toMatch(/largest contributor/);
    expect(text).toMatch(/largest weighted shortfall|No dimension has a weighted shortfall/);
    expect(text).toMatch(/top fix-first move|no move is flagged/);
  });
  it('the strong persona: D4 is the largest contributor (25.5 of 78) and the flat ranking is qualified (issue 2)', () => {
    const s = deterministicSummary(STRONG);
    expect(s.sentences.join(' ')).toContain('D4 Governance & compliance, with 25.5 of its 78 points');
    expect(s.flatNote).toMatch(/No dimension is a clear priority/);
  });
  it('spec ruling 5: the imbalance note shows at a gap of exactly 5', () => {
    expect(deterministicSummary({ ...MEDIAN, compensationGap: 5, compensationBand: 'moderate' }).imbalanceNote).not.toBeNull();
    expect(deterministicSummary({ ...MEDIAN, compensationGap: 4, compensationBand: 'balanced' }).imbalanceNote).toBeNull();
  });
  it('the prompt tells the model not to restate numbers, and marks its narrative fields as not shown', () => {
    const { system } = buildRecommendationPrompt(MEDIAN, NO_NUDGE);
    expect(system).toMatch(/Do not recompute, restate, quote or characterize any score/);
    expect(system).toMatch(/"scoreNarrative": "string — ONE sentence, no numbers/);
  });
});

describe('Fix 3 — auditable checks', () => {
  it('a repaired reply returns the first attempt\'s errors', async () => {
    const t = mockTransport([reply(MALFORMED), reply(WELL_FORMED)]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'm' });
    if (out.kind !== 'live') throw new Error(out.kind);
    expect(out.attempts).toBe(2);
    expect(out.repairErrors.join('\n')).toMatch(/no JSON object|not valid JSON/);
  });
  it('a valid first reply has no repair errors', async () => {
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: mockTransport([reply(WELL_FORMED)]), model: 'm' });
    expect(out.kind === 'live' && out.repairErrors).toEqual([]);
  });
  it('two invalid replies return both attempts\' errors', async () => {
    const t = mockTransport([reply(MALFORMED), reply(JSON.stringify(response([uc('only one', [])])))]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'm' });
    if (out.kind !== 'invalid-response') throw new Error(out.kind);
    expect(out.errors.join('\n')).toMatch(/no JSON object|not valid JSON/);
    expect(out.retryErrors.join('\n')).toMatch(/useCases must have 2-4 entries \(got 1\)/);
  });
  it('a cut-off reply says so', () => {
    const r = parseModelReply('{"scoreNarrative": "x", "useCa', contract({ min: 2, max: 4 }), 'max_tokens');
    expect(!r.ok && r.errors[0]).toMatch(/cut off at the token limit/);
  });
  it('model values echoed in errors are truncated', () => {
    const long = { ...WELL_FORMED, useCases: [{ ...uc('A', []), outcomeConfidence: 'x'.repeat(500) }, uc('B', [])] };
    const r = parseModelReply(JSON.stringify(long), contract({ min: 2, max: 4 }));
    expect(!r.ok && r.errors.every((e) => e.length < 200)).toBe(true);
  });
});

describe('Fix 4 — schema-constrained output', () => {
  it('every request carries the response schema through output_config.format', async () => {
    const t = mockTransport([reply(MALFORMED), reply(WELL_FORMED)]);
    await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'm' });
    expect(t.calls).toHaveLength(2);
    for (const c of t.calls) expect(c.output_config).toEqual({ format: { type: 'json_schema', schema: MODEL_RESPONSE_SCHEMA } });
  });
  it('schema enums come from the validator\'s vocabulary', () => {
    const json = JSON.stringify(MODEL_RESPONSE_SCHEMA);
    expect(json).toContain(JSON.stringify([...USE_CASE_CATEGORIES]));
    expect(json).toContain(JSON.stringify([...DIMENSION_IDS]));
    expect(json).toContain(JSON.stringify([...GATE_IDS]));
    expect(GATE_IDS).toContain('G-U5');
  });
  it('respects the API\'s schema rules: closed objects, every property required, few unions', () => {
    let unions = 0;
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (typeof node !== 'object' || node === null) return;
      const n = node as Record<string, unknown>;
      if (n.type === 'object') {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
      }
      if (Array.isArray(n.type) || 'anyOf' in n) unions += 1;
      Object.values(n).forEach(walk);
    };
    walk(MODEL_RESPONSE_SCHEMA);
    expect(unions).toBeLessThanOrEqual(16);
  });
  it('enum casing is not guaranteed by the API, so the validator matches case-insensitively', () => {
    const cased = response([{ ...uc('A', ['Entity-Resolution' as never]), outcomeConfidence: 'High' as never }, uc('B', [])]);
    const r = parseModelReply(JSON.stringify(cased), contract({ min: 2, max: 4 }));
    expect(r.ok && r.value.useCases[0]).toMatchObject({ outcomeConfidence: 'high', categories: ['entity-resolution'] });
  });
});
