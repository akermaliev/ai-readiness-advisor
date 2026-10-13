/**
 * Direct browser -> Anthropic API. No backend, no proxy.
 *
 * Key handling (a stated security property of the project):
 * - The key is an argument to `createAnthropicTransport`, held by the caller in React state.
 * - It is sent only in the x-api-key header to api.anthropic.com.
 * - Nothing here stores it, logs it, or includes it in an error message.
 */
export interface ChatMessage { readonly role: 'user' | 'assistant'; readonly content: string }

export interface MessagesRequest {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: string;
  readonly messages: readonly ChatMessage[];
  /** Adaptive thinking (v1.2, A1). Only sent to models that support it; see MODEL_OPTIONS. */
  readonly thinking?: { readonly type: 'adaptive' };
  /**
   * `format`: structured output (v1.1, Fix 4). `effort`: how much work the model puts in
   * (v1.2, A1), only for models that support it. Both GA, no beta header.
   */
  readonly output_config?: {
    readonly format: { readonly type: 'json_schema'; readonly schema: unknown };
    readonly effort?: 'low' | 'medium' | 'high';
  };
}

/** What the API reports about a reply, shown on the page for the real-call review (Part B). */
export interface ReplyMeta {
  /** The API's stop_reason ("end_turn", "max_tokens", "refusal", ...) or null if absent. */
  readonly stopReason: string | null;
  /** Content block types returned, in order, e.g. ["thinking", "text"]. */
  readonly blockTypes: readonly string[];
  readonly outputTokens: number | null;
  /** usage.output_tokens_details.thinking_tokens */
  readonly thinkingTokens: number | null;
}

export type TransportResult =
  /**
   * A 200 reply. `text` is "" when no text block came back (for example, a reply that spent
   * the whole token budget thinking); the caller treats that like a malformed reply.
   */
  | ({ readonly ok: true; readonly text: string } & ReplyMeta)
  | { readonly ok: false; readonly kind: 'http' | 'network' | 'timeout'; readonly status: number | null; readonly message: string };

export type Transport = (req: MessagesRequest) => Promise<TransportResult>;

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

/**
 * The current Claude generation (5.5). `adaptive`: the model supports thinking {type: "adaptive"}
 * and output_config.effort; all three do, and all three support structured outputs.
 * Checked against Anthropic's models, effort and structured-outputs docs on 2026-10-12.
 * Replaced Sonnet 5 and Haiku 4.5 (Haiku 4.5 could not take adaptive thinking and is the oldest,
 * with the earliest retirement date).
 */
export const MODEL_OPTIONS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (default)', adaptive: true },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', adaptive: true },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', adaptive: true },
] as const;
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Whether a model id gets adaptive thinking and effort. Unknown ids get neither (safe: no 400). */
export function supportsAdaptive(model: string): boolean {
  return MODEL_OPTIONS.some((m) => m.id === model && m.adaptive);
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === 'object' && v !== null;

function textOf(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.content)) return null;
  const parts = (body.content as readonly unknown[]).flatMap((b) =>
    isRecord(b) && b.type === 'text' && typeof b.text === 'string' ? [b.text] : []);
  return parts.length === 0 ? null : parts.join('');
}

function metaOf(body: unknown): ReplyMeta {
  const r = isRecord(body) ? body : {};
  const usage = isRecord(r.usage) ? r.usage : {};
  const details = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : {};
  return {
    stopReason: typeof r.stop_reason === 'string' ? r.stop_reason : null,
    blockTypes: Array.isArray(r.content) ? (r.content as readonly unknown[]).map((b) => (isRecord(b) && typeof b.type === 'string' ? b.type : 'unknown')) : [],
    outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : null,
    thinkingTokens: typeof details.thinking_tokens === 'number' ? details.thinking_tokens : null,
  };
}

function errorMessageOf(body: unknown, status: number): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string') return body.error.message;
  return `HTTP ${status}`;
}

export function createAnthropicTransport(
  apiKey: string, opts: { readonly timeoutMs?: number; readonly fetchImpl?: typeof fetch } = {},
): Transport {
  // 16,000 output tokens with thinking can take minutes on the larger models (v1.2, A1).
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const doFetch = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  return async (req) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          // Required for CORS: the request comes straight from the visitor's browser.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(req),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, kind: 'http', status: res.status, message: errorMessageOf(body, res.status) };
      return { ok: true, text: textOf(body) ?? '', ...metaOf(body) };
    } catch (e) {
      if (controller.signal.aborted) return { ok: false, kind: 'timeout', status: null, message: `No response within ${Math.round(timeoutMs / 1000)} seconds.` };
      return { ok: false, kind: 'network', status: null, message: e instanceof Error ? e.message : 'Network error' };
    } finally {
      clearTimeout(timer);
    }
  };
}
