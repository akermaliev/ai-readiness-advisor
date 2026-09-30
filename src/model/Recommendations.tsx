import { useState, type ReactNode } from 'react';
import type { ProblemStatement, ScoringOutput } from '../data/types';
import { dimensionLabel, dimensionName, industryLabel, categoryLabel, gateEffectText } from '../report/lookups';
import { Button, Callout, StatusIcon, StatusLabel, type Tone } from '../ui/primitives';
import { createAnthropicTransport, DEFAULT_MODEL, MODEL_OPTIONS, type ReplyMeta } from './client';
import { areaLabel, untilText } from './display';
import { buildFallbackRecommendations } from './fallback';
import type { DisplayBlocked, DisplayUseCase, VerifiedRecommendations } from './gateVerification';
import type { PdfRecommendations } from '../pdf/reportPdf';
import type { SelectedAnswers } from './prompt';
import { requestRecommendations } from './recommend';

/** Validation errors from the model's replies, shown on the page (Fix 3), never logged. */
interface ReplyProblems { readonly first: readonly string[]; readonly retry: readonly string[] }

/** What the API reported about each reply, and how long the whole call took (v1.2, Part B review). */
interface RunDetails { readonly model: string; readonly replies: readonly ReplyMeta[]; readonly elapsedMs: number }

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'live'; result: VerifiedRecommendations; model: string; attempts: 1 | 2; repairErrors: readonly string[]; run: RunDetails }
  | { kind: 'fallback'; result: VerifiedRecommendations; reason: string | null; problems: ReplyProblems | null; run: RunDetails | null }
  | { kind: 'error'; message: string };

/**
 * Stage 5 — appended below the deterministic report; never changes anything above it.
 * The API key lives only in this component's state: not persisted, not logged, sent only
 * to api.anthropic.com, gone on refresh or "Start over".
 */
export function Recommendations({ output, problem, answers, onResult }: {
  output: ScoringOutput; problem: ProblemStatement; answers: SelectedAnswers;
  /** Reports what is on screen, for the PDF (v1.2 C2). Never carries the key or reply internals. */
  onResult?: (r: PdfRecommendations | null) => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [state, setState] = useState<State>({ kind: 'idle' });

  const showFallback = (reason: string | null, problems: ReplyProblems | null = null, run: RunDetails | null = null) => {
    const result = buildFallbackRecommendations(output, problem);
    setState({ kind: 'fallback', result, reason, problems, run });
    onResult?.({ kind: 'fallback', generatedAt: new Date(), result });
  };

  const generate = async () => {
    if (apiKey.trim() === '') return;
    setState({ kind: 'loading' });
    onResult?.(null);
    const started = performance.now();
    const outcome = await requestRecommendations({ output, problem, answers, model, transport: createAnthropicTransport(apiKey.trim()) });
    const elapsedMs = Math.round(performance.now() - started);
    if (outcome.kind === 'live') {
      setState({ kind: 'live', result: outcome.result, model, attempts: outcome.attempts, repairErrors: outcome.repairErrors, run: { model, replies: outcome.replies, elapsedMs } });
      onResult?.({ kind: 'live', model, generatedAt: new Date(), result: outcome.result });
    } else if (outcome.kind === 'invalid-response') {
      showFallback('The model\'s reply did not follow the required format and rules, even after one retry, so pre-written examples are shown instead.',
        { first: outcome.errors, retry: outcome.retryErrors }, { model, replies: outcome.replies, elapsedMs });
    }
    else setState({ kind: 'error', message: outcome.status === null ? outcome.message : `${outcome.message} (HTTP ${outcome.status})` });
  };

  return (
    <section className="rounded-xl border-2 border-dashed border-line bg-panel p-5 sm:p-6" aria-labelledby="recs" data-testid="recommendations">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Model-generated · optional</p>
        <h2 id="recs" className="mt-1 text-lg font-semibold text-ink">Recommendations</h2>
        <p className="mt-1 text-sm text-ink-2">
          Everything above was computed in your browser and stands on its own. This section asks a model to suggest use
          cases against that assessment. Every suggestion is checked in code against your gates before it is shown.
        </p>
      </header>

      <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); void generate(); }}>
        <div>
          <label htmlFor="api-key" className="mb-1 block text-sm font-medium text-ink">Anthropic API key</label>
          <input id="api-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off" spellCheck={false} data-1p-ignore data-lpignore="true" placeholder="sk-ant-…"
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none" />
        </div>
        <div>
          <label htmlFor="model" className="mb-1 block text-sm font-medium text-ink">Model</label>
          <select id="model" value={model} onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none">
            {MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <p className="text-xs text-ink-3 sm:col-span-2">
          Your key stays in this tab's memory. It is sent only to api.anthropic.com, never stored or logged, and is gone
          when you refresh.
        </p>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={apiKey.trim() === '' || state.kind === 'loading'}>
            {state.kind === 'loading' ? 'Generating…' : 'Generate recommendations'}
          </Button>
          <Button variant="secondary" onClick={() => showFallback(null)} disabled={state.kind === 'loading'}>
            Show pre-written examples (no key)
          </Button>
        </div>
      </form>

      <div className="mt-6" aria-live="polite">
        {state.kind === 'error' && (
          <Callout tone="critical" title="The request failed">
            {state.message} The assessment above is unaffected. Check the key and try again, or use the pre-written examples.
          </Callout>
        )}
        {state.kind === 'live' && (
          <RecommendationsView result={state.result} banner={
            <>
              <Callout tone="info" title={`Generated by ${state.model} for your answers`}>
                {state.attempts === 2 && 'The first reply was unusable and was replaced on a second attempt. '}
                {state.result.dropped.length > 0
                  ? `${state.result.dropped.length} suggestion${state.result.dropped.length === 1 ? ' was' : 's were'} removed by the code check because an active gate blocks it.`
                  : 'Every suggestion passed the code check against your gates.'}
              </Callout>
              {state.repairErrors.length > 0 && <ReplyProblemsDetails problems={{ first: state.repairErrors, retry: [] }} />}
              <RunDetailsPanel run={state.run} />
            </>
          } />
        )}
        {state.kind === 'fallback' && (
          <RecommendationsView result={state.result} banner={
            <>
              <Callout tone="warning" title={`Pre-written examples for ${industryLabel(output.industry)}, not generated for your answers`}>
                {state.reason !== null && <>{state.reason} </>}
                The summary and roadmap are filled in from your score with no model involved; the use cases are fixed examples,
                checked against your gates the same way live suggestions are.
              </Callout>
              {state.problems !== null && <ReplyProblemsDetails problems={state.problems} />}
              {state.run !== null && <RunDetailsPanel run={state.run} />}
            </>
          } />
        )}
      </div>
    </section>
  );
}

const CONFIDENCE: Readonly<Record<'high' | 'medium' | 'low', { tone: Tone; label: string; card: string }>> = {
  high: { tone: 'good', label: 'High confidence', card: 'border-line' },
  medium: { tone: 'info', label: 'Medium confidence', card: 'border-line' },
  low: { tone: 'warning', label: 'Low confidence', card: 'border-dashed border-ink-3' },
};

function UseCaseCard({ item }: { item: DisplayUseCase }) {
  const { useCase: u } = item;
  const conf = CONFIDENCE[u.outcomeConfidence];
  return (
    <li className={`rounded-lg border p-4 ${conf.card}`} data-testid={item.source === 'fixture' ? 'fixture-use-case' : 'use-case'}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <StatusLabel tone={conf.tone}>{conf.label}</StatusLabel>
        <span className="text-xs text-ink-2">{u.implementationRisk} implementation risk</span>
        {u.isBackOfficeAlternative && <span className="rounded bg-intent px-2 py-0.5 text-xs font-medium text-ink">Back-office alternative</span>}
      </div>
      <h4 className="mt-2 font-semibold text-ink">{u.title}</h4>
      <p className="mt-1 text-sm text-ink-2">{u.description}</p>
      <p className="mt-2 text-sm text-ink"><span className="font-medium">Expected outcome:</span> {u.expectedOutcome}</p>
      {item.tradeoff !== null && <p className="mt-2 rounded-md bg-intent px-3 py-2 text-sm text-ink"><span className="font-medium">The tradeoff:</span> {item.tradeoff}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="use-case-categories">
        <span className="text-xs font-medium text-ink">Gated kinds of work:</span>
        {u.categories.length === 0
          ? <span className="text-xs text-ink-2">touches no gated kind of work</span>
          : u.categories.map((c) => (
            <span key={c} className="rounded border border-line bg-surface px-1.5 py-0.5 text-xs text-ink-2" title={c}>{categoryLabel(c)}</span>
          ))}
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-ink-2 sm:grid-cols-2">
        <div><dt className="inline font-medium text-ink">Depends on: </dt><dd className="inline">{u.dependsOnDimension} {dimensionName(u.dependsOnDimension)}</dd></div>
        <div><dt className="inline font-medium text-ink">Area: </dt><dd className="inline" data-testid="use-case-area">{areaLabel(u.targetFunction)}</dd></div>
        {u.riskDrivers.length > 0 && <div className="sm:col-span-2"><dt className="inline font-medium text-ink">Risk drivers: </dt><dd className="inline">{u.riskDrivers.join('; ')}</dd></div>}
      </dl>
      {u.governanceFlags.length > 0 && (
        <ul className="mt-2 space-y-1">
          {u.governanceFlags.map((g, i) => (
            <li key={i} className="flex gap-2 text-xs text-ink-2"><StatusIcon tone="info" /><span><span className="font-medium text-ink">{g.type}:</span> {g.note}</span></li>
          ))}
        </ul>
      )}
    </li>
  );
}

const BLOCKED_SOURCE: Readonly<Record<DisplayBlocked['source'], string>> = {
  'client-check': 'Suggested by the model, removed by the code check',
  model: 'Acknowledged by the model',
  fixture: 'Back-office alternative, blocked for now',
};

function RecommendationsView({ result, banner }: { result: VerifiedRecommendations; banner: ReactNode }) {
  return (
    <div className="space-y-5">
      {banner}
      <div data-testid="score-summary">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Your score in brief · computed from your assessment, no model involved</p>
        <p className="mt-1 text-sm text-ink">{result.summary.sentences.join(' ')}</p>
        {result.summary.flatNote !== null && <p className="mt-2 text-sm text-ink-2">{result.summary.flatNote}</p>}
        {result.summary.imbalanceNote !== null && <p className="mt-2 text-sm text-ink-2">{result.summary.imbalanceNote}</p>}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink">Use cases</h3>
        {result.useCases.length === 0
          ? <p className="mt-2 text-sm text-ink-2">No suggestion survived the gate check. See what is blocked and what would unblock it below.</p>
          : <ul className="mt-2 space-y-3">{result.useCases.map((u) => <UseCaseCard key={`${u.source}-${u.useCase.title}`} item={u} />)}</ul>}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink">Roadmap</h3>
        <div className="mt-2 space-y-2 text-sm">
          {result.roadmap.prerequisite !== null && <p className="text-ink"><span className="font-medium">First, close this gap:</span> {result.roadmap.prerequisite}</p>}
          {result.pilotBlocked
            ? <Callout tone="critical" title={`The suggested pilot, "${result.roadmap.pilotFirst.useCaseTitle}", is blocked by a gate`}>It was removed by the code check; see below for what would unblock it.</Callout>
            : <p className="text-ink"><span className="font-medium">Pilot first:</span> {result.roadmap.pilotFirst.useCaseTitle}. <span className="text-ink-2">{result.roadmap.pilotFirst.rationale}</span></p>}
          {result.pilotDependsOnFixFirst !== null && (
            <div data-testid="pilot-fix-first-note">
              <Callout tone="warning" title={`The suggested pilot depends on ${dimensionLabel(result.pilotDependsOnFixFirst)}, the dimension to fix first.`}>
                Flagged by the code check, not removed. Starting here means piloting on your weakest link; consider closing
                that gap first or piloting a use case that depends on a different dimension.
              </Callout>
            </div>
          )}
          {result.roadmap.defer.length > 0 && (
            <ul className="space-y-1 text-ink-2">{result.roadmap.defer.map((d) => <li key={d.useCaseTitle} data-testid="deferral">Defer <span className="text-ink">{d.useCaseTitle}</span> until {untilText(d.until)}.</li>)}</ul>
          )}
        </div>
      </div>

      {result.blocked.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink">Blocked, and what would unblock it</h3>
          <ul className="mt-2 space-y-3" data-testid="blocked-acknowledged">
            {result.blocked.map((b) => (
              <li key={`${b.source}-${b.title}-${b.gateId}-${b.useCaseCategory}`} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusLabel tone="critical">{BLOCKED_SOURCE[b.source]}</StatusLabel>
                  <span className="font-mono text-xs text-ink-3">{b.gateId}</span>
                </div>
                <h4 className="mt-2 font-semibold text-ink">{b.title}</h4>
                <p className="mt-1 text-sm text-ink-2">{b.description}</p>
                <p className="mt-2 text-xs text-ink-2">{categoryLabel(b.useCaseCategory)} · {gateEffectText(b.gateId)}</p>
                <p className="mt-2 text-sm text-ink"><span className="font-medium">What would unblock it:</span> {b.unblockCondition}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Fix 3: what the code check found wrong in the model's replies, collapsed by default. The
 * errors come from the validator, so they name fields and rules, never the key.
 */
function ReplyProblemsDetails({ problems }: { problems: ReplyProblems }) {
  return (
    <details className="rounded-lg border border-line px-4 py-2.5 text-sm" data-testid="reply-problems">
      <summary className="cursor-pointer font-medium text-ink">What was wrong with the first reply</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-2">
        {problems.first.map((e, i) => <li key={i} className="break-words font-mono">{e}</li>)}
      </ul>
      {problems.retry.length > 0 && (
        <>
          <p className="mt-3 font-medium text-ink">Still wrong after the retry</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-2">
            {problems.retry.map((e, i) => <li key={i} className="break-words font-mono">{e}</li>)}
          </ul>
        </>
      )}
    </details>
  );
}

/**
 * v1.2: what the API reported about each reply, for the real-call review. Numbers only;
 * never the key, the prompt, or the reply text.
 */
function RunDetailsPanel({ run }: { run: RunDetails }) {
  return (
    <details className="rounded-lg border border-line px-4 py-2.5 text-sm" data-testid="run-details">
      <summary className="cursor-pointer font-medium text-ink">Run details</summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-ink-2">
        <dt className="font-medium text-ink">Model</dt><dd className="font-mono">{run.model}</dd>
        <dt className="font-medium text-ink">Time to result</dt><dd>{(run.elapsedMs / 1000).toFixed(1)} s</dd>
        {run.replies.map((r, i) => (
          <div key={i} className="contents">
            <dt className="font-medium text-ink">Reply {i + 1}</dt>
            <dd className="font-mono">
              stop_reason {r.stopReason ?? 'unknown'} · output {r.outputTokens ?? '?'} tokens · thinking {r.thinkingTokens ?? 0} · blocks {r.blockTypes.join(', ') || 'none'}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
