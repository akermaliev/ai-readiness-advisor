/**
 * Stage 5 orchestration — Methodology → Model Output Contract → Failure handling.
 *
 *   valid reply                      -> gate-verified recommendations
 *   invalid JSON / schema / rules    -> one retry with a repair instruction, then fall back
 *   API error, timeout, network      -> report the failure; the deterministic report is
 *                                       unaffected and the fallback is one click away
 *
 * Every request carries the response JSON Schema (Fix 4). The first attempt's validation
 * errors are returned with the outcome (Fix 3) so the page can show what the repair fixed.
 * They are returned, never logged, and never contain the key: the key is not in the prompt,
 * so no reply can echo it.
 */
import type { ProblemStatement, ScoringOutput } from '../data/types';
import type { ChatMessage, Transport } from './client';
import { applyGateVerification, type VerifiedRecommendations } from './gateVerification';
import { buildRecommendationPrompt, repairInstruction } from './prompt';
import { OUTPUT_CONFIG } from './schema';
import { parseModelReply } from './validate';

export type RecommendationOutcome =
  | {
    readonly kind: 'live'; readonly result: VerifiedRecommendations; readonly attempts: 1 | 2;
    /** What was wrong with the first reply; empty when it was valid. */
    readonly repairErrors: readonly string[];
  }
  | {
    readonly kind: 'invalid-response'; readonly attempts: 2;
    /** What was wrong with the first reply. */
    readonly errors: readonly string[];
    /** What was still wrong after the repair attempt. */
    readonly retryErrors: readonly string[];
  }
  | { readonly kind: 'request-failed'; readonly reason: 'http' | 'network' | 'timeout'; readonly status: number | null; readonly message: string; readonly attempts: 1 | 2 };

export const MAX_TOKENS = 4096;

export async function requestRecommendations(args: {
  readonly output: ScoringOutput; readonly problem: ProblemStatement; readonly transport: Transport; readonly model: string;
}): Promise<RecommendationOutcome> {
  const prompt = buildRecommendationPrompt(args.output, args.problem);
  const send = (messages: readonly ChatMessage[]) =>
    args.transport({ model: args.model, max_tokens: MAX_TOKENS, system: prompt.system, messages, output_config: OUTPUT_CONFIG });

  const first: readonly ChatMessage[] = [{ role: 'user', content: prompt.user }];
  const r1 = await send(first);
  if (!r1.ok) return { kind: 'request-failed', reason: r1.kind, status: r1.status, message: r1.message, attempts: 1 };
  const p1 = parseModelReply(r1.text, prompt, r1.stopReason);
  if (p1.ok) return { kind: 'live', result: applyGateVerification(p1.value, args.output, prompt.fixture), attempts: 1, repairErrors: [] };

  const r2 = await send([...first, { role: 'assistant', content: r1.text }, { role: 'user', content: repairInstruction(p1.errors, prompt.range) }]);
  if (!r2.ok) return { kind: 'request-failed', reason: r2.kind, status: r2.status, message: r2.message, attempts: 2 };
  const p2 = parseModelReply(r2.text, prompt, r2.stopReason);
  if (p2.ok) return { kind: 'live', result: applyGateVerification(p2.value, args.output, prompt.fixture), attempts: 2, repairErrors: p1.errors };
  return { kind: 'invalid-response', attempts: 2, errors: p1.errors, retryErrors: p2.errors };
}
