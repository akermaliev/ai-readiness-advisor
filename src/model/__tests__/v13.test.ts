/** v1.3 — the roadmap: computed prerequisite path, new pilot and deferral fields, the flat-ranking case. */
import { describe, expect, it } from 'vitest';
import { SENSITIVITY_TARGET } from '../../data/bands';
import { calibrationPersonas } from '../../data/calibrationPersonas';
import type { ModelResponse, ModelUseCase, ProblemStatement, ReadinessInput } from '../../data/types';
import { computeReadiness } from '../../engine';
import { hasUnprintable, pdfText } from '../../pdf/pdfText';
import type { MessagesRequest, Transport, TransportResult } from '../client';
import { buildFallbackRecommendations } from '../fallback';
import { applyGateVerification } from '../gateVerification';
import { buildRecommendationPrompt } from '../prompt';
import { requestRecommendations } from '../recommend';
import { buildRoadmapView } from '../roadmapView';
import { MODEL_RESPONSE_SCHEMA } from '../schema';
import { isFlatSensitivity } from '../summary';
import { parseModelReply } from '../validate';

const persona = (id: string): ReadinessInput => {
  const p = calibrationPersonas.find((x) => x.id === id);
  if (p === undefined) throw new Error(id);
  return p.input;
};
const MEDIAN_IN = persona('median');
const STRONG_IN = persona('strong');
const MEDIAN = computeReadiness(MEDIAN_IN);
const STRONG = computeReadiness(STRONG_IN);
const NO_NUDGE: ProblemStatement = { primaryBottleneck: 'forecasting-planning', targetFunction: 'supply-chain' };

const uc = (title: string, dependsOnDimension: ModelUseCase['dependsOnDimension']): ModelUseCase => ({
  title, description: `${title} description`, categories: [], targetFunction: 'supply-chain',
  expectedOutcome: 'Less manual effort.', outcomeConfidence: 'medium', implementationRisk: 'low',
  riskDrivers: [], governanceFlags: [], dependsOnDimension, isBackOfficeAlternative: false,
});
const reply = (prerequisite: string | null, defer: ModelResponse['roadmap']['defer'] = []): ModelResponse => ({
  scoreNarrative: 'x', imbalanceNote: null,
  useCases: [uc('Planning knowledge assistant', 'D2'), uc('Forecast drafting', 'D1')],
  roadmap: {
    pilotFirst: {
      useCaseTitle: 'Planning knowledge assistant', rationale: 'Starts on existing content.',
      successMeasure: 'Time planners spend finding prior context, against a baseline.', stopCondition: 'Planners stop using it.',
      goalNote: 'Forecasting depends on D1 Data maturity & accessibility, so it comes second.',
    },
    prerequisite, defer,
  },
  blockedAcknowledged: [],
});
const text = (r: TransportResult & { ok: true }) => r;
const ok = (body: unknown, stopReason = 'end_turn'): TransportResult =>
  text({ ok: true, text: typeof body === 'string' ? body : JSON.stringify(body), stopReason, blockTypes: ['text'], outputTokens: 1, thinkingTokens: 0 });

describe('v1.3 — reply contract', () => {
  it('the schema requires the pilot success measure, stop condition and goal note, and question ids on deferrals', () => {
    const roadmap = (MODEL_RESPONSE_SCHEMA.properties as Record<string, { properties: Record<string, { required?: string[]; items?: { required: string[]; properties: Record<string, { items: { enum: string[] } }> } }> }>).roadmap;
    expect(roadmap?.properties.pilotFirst?.required).toEqual(['useCaseTitle', 'rationale', 'successMeasure', 'stopCondition', 'goalNote']);
    expect(roadmap?.properties.defer?.items?.required).toEqual(['useCaseTitle', 'until', 'unlockAnswers']);
    expect(roadmap?.properties.defer?.items?.properties.unlockAnswers?.items.enum).toHaveLength(24);
  });

  it('a deferral may only wait on answers below the top option; "Q1.3" and "1.3" are the same id', () => {
    const p = buildRecommendationPrompt(MEDIAN, NO_NUDGE, MEDIAN_IN);
    const good = parseModelReply(JSON.stringify(reply('Close D1 Data maturity & accessibility.', [{ useCaseTitle: 'Forecast drafting', until: 'D1 Data maturity & accessibility improves', unlockAnswers: ['Q1.2', '1.3'] as never }])), p);
    expect(good.ok && good.value.roadmap.defer[0]?.unlockAnswers).toEqual(['1.2', '1.3']);
    const topOption = (['1.1', '2.1', '3.1', '4.1', '5.1', '6.1'] as const).find((q) => !p.belowTop?.includes(q));
    expect(topOption).toBeDefined();
    const bad = parseModelReply(JSON.stringify(reply('Close D1 Data maturity & accessibility.', [{ useCaseTitle: 'Forecast drafting', until: 'later', unlockAnswers: [topOption as never] }])), p);
    expect(!bad.ok && bad.errors.join('\n')).toMatch(/already answered at the top option/);
  });

  it('a blank goal note is no note', () => {
    const p = buildRecommendationPrompt(MEDIAN, NO_NUDGE, MEDIAN_IN);
    const r = reply('Close D1 Data maturity & accessibility.');
    const blank = parseModelReply(JSON.stringify({ ...r, roadmap: { ...r.roadmap, pilotFirst: { ...r.roadmap.pilotFirst, goalNote: ' ' } } }), p);
    expect(blank.ok && blank.value.roadmap.pilotFirst.goalNote).toBeNull();
  });

  it('flat ranking (strong bank): the prerequisite is optional, may name any dimension below adequate, and the pilot is never flagged', () => {
    expect(isFlatSensitivity(STRONG)).toBe(true);
    const p = buildRecommendationPrompt(STRONG, NO_NUDGE, STRONG_IN);
    expect(p.fixFirstRequired).toBe(false);
    expect(parseModelReply(JSON.stringify(reply(null)), p).ok).toBe(true);
    const below = STRONG.dimensions.find((d) => d.normalized < SENSITIVITY_TARGET && d.id !== p.fixFirst);
    const above = STRONG.dimensions.find((d) => d.normalized >= SENSITIVITY_TARGET);
    expect(below && above).toBeTruthy();
    const names: Record<string, string> = { D1: 'Data maturity & accessibility', D2: 'Integration architecture', D3: 'Process definition', D4: 'Governance & compliance', D5: 'Team & tooling capacity', D6: 'Strategy & sponsorship' };
    expect(parseModelReply(JSON.stringify(reply(`Optional: ${below?.id} ${names[below?.id ?? '']}.`)), p).ok).toBe(true);
    const wrong = parseModelReply(JSON.stringify(reply(`Optional: ${above?.id} ${names[above?.id ?? '']}.`)), p);
    expect(!wrong.ok && wrong.errors.join('\n')).toMatch(/must be null or name one dimension below adequate/);
    const v = applyGateVerification({ ...reply(null), useCases: [uc('Planning knowledge assistant', p.fixFirst ?? 'D2'), uc('Forecast drafting', 'D1')] }, STRONG, null);
    expect(v.pilotDependsOnFixFirst).toBeNull();
  });

  it('a cut-off reply is retried at low effort; a repair keeps medium', async () => {
    const calls: MessagesRequest[] = [];
    const queue = [ok('{"partial', 'max_tokens'), ok(reply('Close D1 Data maturity & accessibility.'))];
    const t: Transport = async (req) => { calls.push(req); return queue.shift() as TransportResult; };
    const out = await requestRecommendations({ output: MEDIAN, problem: NO_NUDGE, answers: MEDIAN_IN, transport: t, model: 'claude-sonnet-5' });
    expect(out.kind).toBe('live');
    expect(calls.map((c) => c.output_config?.effort)).toEqual(['medium', 'low']);
  });
});

describe('v1.3 — roadmap view', () => {
  it('median: step 1 is the D1 gap with the engine path to 75; the pilot can start alongside; deferrals show current answers', () => {
    const p = buildRecommendationPrompt(MEDIAN, NO_NUDGE, MEDIAN_IN);
    const parsed = parseModelReply(JSON.stringify(reply('Close D1 Data maturity & accessibility.', [{ useCaseTitle: 'Forecast drafting', until: 'D1 Data maturity & accessibility improves.', unlockAnswers: ['1.2'] }])), p);
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const view = buildRoadmapView(applyGateVerification(parsed.value, MEDIAN, null), MEDIAN, MEDIAN_IN);
    expect(view.step1.kind).toBe('required');
    expect(view.step1.dimension).toBe('D1');
    const last = view.step1.path?.steps[view.step1.path.steps.length - 1];
    expect(last?.dimensionAfter).toBe(SENSITIVITY_TARGET);
    expect(last?.headlineAfter).toBe(MEDIAN.scoreGeometric + (MEDIAN.sensitivity.find((s) => s.dimensionId === 'D1')?.delta ?? NaN));
    expect(view.step2.timing).toBe('alongside');
    expect(view.step2.goalNote).toMatch(/comes second/);
    expect(view.step3[0]?.unlock).toEqual([{ questionId: '1.2', question: expect.any(String), current: 'Partly, one domain only' }]);
  });

  it('strong (flat): the fallback has nothing to close first and says why', () => {
    const recs = buildFallbackRecommendations(STRONG, NO_NUDGE, STRONG_IN);
    expect(recs.roadmap.prerequisite).toBeNull();
    const view = buildRoadmapView(recs, STRONG, STRONG_IN);
    expect(view.step1.kind).toBe('none');
    expect(view.step1.note).toMatch(/No dimension is a clear priority/);
    expect(view.step2.successMeasure).not.toBe('');
  });

  it('fallback deferrals wait on the fix-first dimension\'s below-top answers', () => {
    const recs = buildFallbackRecommendations(MEDIAN, NO_NUDGE, MEDIAN_IN);
    const view = buildRoadmapView(recs, MEDIAN, MEDIAN_IN);
    for (const d of view.step3) expect(d.unlock.every((u) => u.questionId.startsWith('1.'))).toBe(true);
  });
});

describe('v1.3 — deferral wording (first live run, 2026-10-12)', () => {
  it('lowers a capitalised first word after "until", but keeps acronyms and ids', async () => {
    const { untilText } = await import('../display');
    expect(untilText('An agreed single source of truth exists.')).toBe('an agreed single source of truth exists');
    expect(untilText('The AI-assisted forecast drafting use case is running')).toBe('the AI-assisted forecast drafting use case is running');
    expect(untilText('SKU and sales data are consolidated')).toBe('SKU and sales data are consolidated');
    expect(untilText('D1 Data maturity & accessibility improves')).toBe('D1 Data maturity & accessibility improves');
  });
});

describe('v1.3 — first live runs (2026-10-12)', () => {
  it('a free-text Area is capitalised; known ids still map to labels', async () => {
    const { areaLabel } = await import('../display');
    expect(areaLabel('customer service')).toBe('Customer service');
    expect(areaLabel('supply-chain')).toBe('Supply chain');
  });
  it('flat ranking: a prerequisite that is only the dimension name moves into the heading', () => {
    const p = buildRecommendationPrompt(STRONG, NO_NUDGE, STRONG_IN);
    const parsed = parseModelReply(JSON.stringify(reply('D2 Integration architecture')), p);
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const view = buildRoadmapView(applyGateVerification(parsed.value, STRONG, null), STRONG, STRONG_IN);
    expect(view.step1.kind).toBe('optional');
    expect(view.step1.title).toBe('Optional groundwork: D2 Integration architecture');
    expect(view.step1.text).toBeNull();
    const withText = parseModelReply(JSON.stringify(reply('D2 Integration architecture: APIs exist only on some systems.')), p);
    if (!withText.ok) throw new Error(withText.errors.join('; '));
    expect(buildRoadmapView(applyGateVerification(withText.value, STRONG, null), STRONG, STRONG_IN).step1.text).toMatch(/only on some systems/);
  });
});

describe('v1.3 — PDF text', () => {
  it('flags a company name the built-in font cannot draw', () => {
    expect(hasUnprintable('Кыргыз Телеком')).toBe(true);
    expect(hasUnprintable('Café Münster')).toBe(false);
    expect(hasUnprintable('Who? Inc.')).toBe(false);
    expect(pdfText('Who? Inc.')).toBe('Who? Inc.');
  });
});
