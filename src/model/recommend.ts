/**
 * Stage 5 orchestration — Methodology → Model Output Contract → Failure handling.
 *
 *   valid reply                      -> gate-verified recommendations
 *   invalid JSON / schema            -> one retry with a repair instruction, then fall back
 *   API error, timeout, network      -> report the failure; the deterministic report is
 *                                       unaffected and the fallback is one click away
 */
import type { ProblemStatement, ScoringOutput } from '../data/types';
import type { ChatMessage, Transport } from './client';
import { applyGateVerification, type VerifiedRecommendations } from './gateVerification';
import { buildRecommendationPrompt, repairInstruction } from './prompt';
import { parseModelReply } from './validate';

export type RecommendationOutcome =
  | { readonly kind: 'live'; readonly result: VerifiedRecommendations; readonly attempts: 1 | 2 }
  | { readonly kind: 'invalid-response'; readonly errors: readonly string[]; readonly attempts: 2 }
  | { readonly kind: 'request-failed'; readonly reason: 'http' | 'network' | 'timeout'; readonly status: number | null; readonly message: string; readonly attempts: 1 | 2 };

export const MAX_TOKENS = 4096;

export async function requestRecommendations(args: {
  readonly output: ScoringOutput; readonly problem: ProblemStatement; readonly transport: Transport; readonly model: string;
}): Promise<RecommendationOutcome> {
  const prompt = buildRecommendationPrompt(args.output, args.problem);
  const send = (messages: readonly ChatMessage[]) =>
    args.transport({ model: args.model, max_tokens: MAX_TOKENS, system: prompt.system, messages });

  const first: readonly ChatMessage[] = [{ role: 'user', content: prompt.user }];
  const r1 = await send(first);
  if (!r1.ok) return { kind: 'request-failed', reason: r1.kind, status: r1.status, message: r1.message, attempts: 1 };
  const p1 = parseModelReply(r1.text, prompt.range);
  if (p1.ok) return { kind: 'live', result: applyGateVerification(p1.value, args.output, prompt.fixture), attempts: 1 };

  const r2 = await send([...first, { role: 'assistant', content: r1.text }, { role: 'user', content: repairInstruction(p1.errors, prompt.range) }]);
  if (!r2.ok) return { kind: 'request-failed', reason: r2.kind, status: r2.status, message: r2.message, attempts: 2 };
  const p2 = parseModelReply(r2.text, prompt.range);
  if (p2.ok) return { kind: 'live', result: applyGateVerification(p2.value, args.output, prompt.fixture), attempts: 2 };
  return { kind: 'invalid-response', errors: p2.errors, attempts: 2 };
}
