import { describe, expect, it } from 'vitest';
import { calibrationPersonas } from '../../data/calibrationPersonas';
import type { ModelResponse, ModelUseCase, ProblemStatement, ReadinessInput } from '../../data/types';
import { computeReadiness } from '../../engine';
import { createAnthropicTransport, type MessagesRequest, type Transport, type TransportResult } from '../client';
import { buildFallbackRecommendations } from '../fallback';
import { buildRecommendationPrompt } from '../prompt';
import { requestRecommendations } from '../recommend';
import { parseModelReply } from '../validate';

const persona = (id: string): ReadinessInput => {
  const p = calibrationPersonas.find((x) => x.id === id);
  if (p === undefined) throw new Error(id);
  return p.input;
};
// Weak retailer: Q2.3 = 0 -> G-U1 BLOCKS retrieval-over-internal-content; Q4.1 = 0 -> G-R1 warns.
const WEAK = computeReadiness(persona('weak'));
// Median manufacturer: no gate fires.
const MEDIAN = computeReadiness(persona('median'));
const NUDGE: ProblemStatement = { primaryBottleneck: 'repetitive-analysis-reporting', targetFunction: 'sales-marketing' };
const NO_NUDGE: ProblemStatement = { primaryBottleneck: 'forecasting-planning', targetFunction: 'supply-chain' };

const uc = (title: string, categories: ModelUseCase['categories']): ModelUseCase => ({
  title, description: `${title} description`, categories, targetFunction: 'operations',
  expectedOutcome: 'Faster cycle time.', outcomeConfidence: 'medium', implementationRisk: 'low',
  riskDrivers: ['data quality'], governanceFlags: [{ type: 'reliability', note: 'Human review.' }],
  dependsOnDimension: 'D1', isBackOfficeAlternative: false,
});
const response = (useCases: ModelUseCase[], extra: Partial<ModelResponse> = {}): ModelResponse => ({
  scoreNarrative: 'Held back by data maturity.', imbalanceNote: null, useCases,
  roadmap: { pilotFirst: { useCaseTitle: useCases[0]?.title ?? '', rationale: 'Lowest risk.' }, prerequisite: null,
    defer: useCases.slice(1).map((u) => ({ useCaseTitle: u.title, until: 'later' })) },
  blockedAcknowledged: [], ...extra,
});

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
const reply = (body: unknown): TransportResult => ({ ok: true, text: typeof body === 'string' ? body : JSON.stringify(body) });

const WELL_FORMED = response([uc('Demand forecasting', []), uc('Invoice matching', ['entity-resolution'])]);
const MALFORMED = 'Sure! Here are my recommendations: {"scoreNarrative": "Held back by", "useCases": [';
const GATE_VIOLATING = response([
  uc('Internal knowledge assistant', ['retrieval-over-internal-content']), // G-U1 blocks this for WEAK
  uc('Email personalization', ['personalization-targeting']),              // G-R1 only warns: kept
]);

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
    const r = parseModelReply('{"scoreNarrative": "x", }', { min: 2, max: 4 });
    expect(!r.ok && r.errors[0]).toMatch(/not valid JSON/);
  });
  it('recovers when the retry is valid', async () => {
    const t = mockTransport([reply(MALFORMED), reply(WELL_FORMED)]);
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, transport: t, model: 'm' });
    expect(out.kind === 'live' && out.attempts).toBe(2);
  });
  it('schema violations are malformed too: bad enum, unknown category, wrong count', () => {
    const bad = { ...WELL_FORMED, useCases: [{ ...uc('A', []), outcomeConfidence: 'certain' }, { ...uc('B', []), categories: ['blockchain'] }] };
    const r = parseModelReply(JSON.stringify(bad), { min: 2, max: 4 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toMatch(/outcomeConfidence must be one of/);
    expect(r.errors.join('\n')).toMatch(/"blockchain" is not in the category vocabulary/);
    expect(parseModelReply(JSON.stringify(response([uc('only one', [])])), { min: 2, max: 4 }).ok).toBe(false);
  });
  it('strips keys the schema does not define', () => {
    const r = parseModelReply(JSON.stringify({ ...WELL_FORMED, verdict: 'You are ready for AI' }), { min: 2, max: 4 });
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
    ] });
    const t = mockTransport([reply(withAcks)]);
    const out = await requestRecommendations({ output: WEAK, problem: NO_NUDGE, transport: t, model: 'm' });
    expect(out.kind === 'live' && out.result.blocked.map((b) => b.gateId)).toEqual(['G-U1']);
  });
});

describe('back-office nudge', () => {
  it('a gated fixture is surfaced in blockedAcknowledged with title, description, gate and unblock — never dropped silently', async () => {
    const t = mockTransport([reply(response([uc('Email personalization', ['personalization-targeting']), uc('Demand forecasting', [])]))]);
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
    expect(parseModelReply(JSON.stringify(response([uc('A', []), uc('B', []), uc('C', []), uc('D', [])])), { min: 2, max: 3 }).ok).toBe(false);
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
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"ok":1}' }] }), { status: 200 });
    }) as typeof fetch;
    const r = await createAnthropicTransport(KEY, { fetchImpl: fakeFetch })({ model: 'm', max_tokens: 10, system: 's', messages: [] });
    expect(r).toEqual({ ok: true, text: '{"ok":1}' });
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
  it('templates the narrative from the ScoringOutput, so it states the visitor\'s real numbers', () => {
    const r = buildFallbackRecommendations(MEDIAN, NO_NUDGE);
    expect(r.scoreNarrative).toContain(`headline score of ${MEDIAN.scoreGeometric}`);
    const top = MEDIAN.sensitivity[0];
    expect(r.scoreNarrative).toContain(String(MEDIAN.scoreGeometric + (top?.delta ?? 0)));
  });
});
