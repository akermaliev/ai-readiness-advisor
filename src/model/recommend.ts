/**
 * Stage 5 orchestration — Methodology → Model Output Contract → Failure handling.
 *
 *   valid reply                                  -> gate-verified recommendations
 *   invalid JSON / schema / rules                -> one repair retry, then fall back
 *   cut off (stop_reason max_tokens) or no text  -> one fresh retry, then fall back (v1.2, A1)
 *   API error, timeout, network                  -> report the failure; the deterministic report
 *                                                   is unaffected and the fallback is one click away
 *
 * Every request carries the response JSON Schema (Fix 4); models that support it also get
 * adaptive thinking at medium effort (A1). The first attempt's problems are returned with the
 * outcome (Fix 3), and so is what the API reported about each reply (A1, for the Part B
 * review). They are returned, never logged, and never contain the key: the key is not in the
 * prompt, so no reply can echo it.
 */
import type { ProblemStatement, ScoringOutput } from '../data/types';
import { supportsAdaptive, type ChatMessage, type MessagesRequest, type ReplyMeta, type Transport, type TransportResult } from './client';
import { applyGateVerification, type VerifiedRecommendations } from './gateVerification';
import { buildRecommendationPrompt, repairInstruction, type SelectedAnswers } from './prompt';
import { MODEL_RESPONSE_SCHEMA } from './schema';
import { parseModelReply, type ValidationResult } from './validate';

export type RecommendationOutcome =
  | {
    readonly kind: 'live'; readonly result: VerifiedRecommendations; readonly attempts: 1 | 2;
    /** What was wrong with the first reply; empty when it was valid. */
    readonly repairErrors: readonly string[];
    /** What the API reported about each reply, in order. */
    readonly replies: readonly ReplyMeta[];
  }
  | {
    readonly kind: 'invalid-response'; readonly attempts: 2;
    /** What was wrong with the first reply. */
    readonly errors: readonly string[];
    /** What was still wrong after the retry. */
    readonly retryErrors: readonly string[];
    readonly replies: readonly ReplyMeta[];
  }
  | { readonly kind: 'request-failed'; readonly reason: 'http' | 'network' | 'timeout'; readonly status: number | null; readonly message: string; readonly attempts: 1 | 2 };

/** The answer is ~2-3k tokens; the rest is room for thinking (A1). */
export const MAX_TOKENS = 16_000;

/** The request for a model, with thinking and effort only where the model supports them. */
export function buildRequest(model: string, system: string, messages: readonly ChatMessage[]): MessagesRequest {
  const format = { type: 'json_schema', schema: MODEL_RESPONSE_SCHEMA } as const;
  return supportsAdaptive(model)
    ? { model, max_tokens: MAX_TOKENS, system, messages, thinking: { type: 'adaptive' }, output_config: { format, effort: 'medium' } }
    : { model, max_tokens: MAX_TOKENS, system, messages, output_config: { format } };
}

type Ok = Extract<TransportResult, { ok: true }>;

/** A reply that was cut off or carried no text: a fresh retry, not a repair conversation. */
function cutOffError(r: Ok): string | null {
  if (r.text.trim() === '') {
    return `no text (stop_reason: ${r.stopReason ?? 'unknown'}; returned: ${r.blockTypes.length === 0 ? 'nothing' : r.blockTypes.join(', ')})`;
  }
  if (r.stopReason === 'max_tokens') return 'reply was cut off at the token limit (stop_reason: max_tokens)';
  return null;
}

const meta = (r: Ok): ReplyMeta => ({ stopReason: r.stopReason, blockTypes: r.blockTypes, outputTokens: r.outputTokens, thinkingTokens: r.thinkingTokens });

export async function requestRecommendations(args: {
  readonly output: ScoringOutput; readonly problem: ProblemStatement; readonly answers: SelectedAnswers;
  readonly transport: Transport; readonly model: string;
}): Promise<RecommendationOutcome> {
  const prompt = buildRecommendationPrompt(args.output, args.problem, args.answers);
  const send = (messages: readonly ChatMessage[]) => args.transport(buildRequest(args.model, prompt.system, messages));
  const check = (r: Ok): ValidationResult => {
    const cut = cutOffError(r);
    return cut !== null ? { ok: false, errors: [cut] } : parseModelReply(r.text, prompt, r.stopReason);
  };

  const first: readonly ChatMessage[] = [{ role: 'user', content: prompt.user }];
  const r1 = await send(first);
  if (!r1.ok) return { kind: 'request-failed', reason: r1.kind, status: r1.status, message: r1.message, attempts: 1 };
  const p1 = check(r1);
  if (p1.ok) {
    return { kind: 'live', result: applyGateVerification(p1.value, args.output, prompt.fixture), attempts: 1, repairErrors: [], replies: [meta(r1)] };
  }

  // A cut-off or empty reply is retried fresh: there is no usable reply to repair, and an
  // empty assistant turn is not a valid message.
  const retry: readonly ChatMessage[] = cutOffError(r1) !== null
    ? first
    : [...first, { role: 'assistant', content: r1.text }, { role: 'user', content: repairInstruction(p1.errors, prompt.range) }];
  const r2 = await send(retry);
  if (!r2.ok) return { kind: 'request-failed', reason: r2.kind, status: r2.status, message: r2.message, attempts: 2 };
  const p2 = check(r2);
  if (p2.ok) {
    return { kind: 'live', result: applyGateVerification(p2.value, args.output, prompt.fixture), attempts: 2, repairErrors: p1.errors, replies: [meta(r1), meta(r2)] };
  }
  return { kind: 'invalid-response', attempts: 2, errors: p1.errors, retryErrors: p2.errors, replies: [meta(r1), meta(r2)] };
}
