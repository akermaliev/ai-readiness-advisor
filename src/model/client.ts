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
}

export type TransportResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly kind: 'http' | 'network' | 'timeout'; readonly status: number | null; readonly message: string };

export type Transport = (req: MessagesRequest) => Promise<TransportResult>;

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

export const MODEL_OPTIONS = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (default)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
] as const;
export const DEFAULT_MODEL = 'claude-sonnet-5';

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === 'object' && v !== null;

function textOf(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.content)) return null;
  const parts = (body.content as readonly unknown[]).flatMap((b) =>
    isRecord(b) && b.type === 'text' && typeof b.text === 'string' ? [b.text] : []);
  return parts.length === 0 ? null : parts.join('');
}

function errorMessageOf(body: unknown, status: number): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string') return body.error.message;
  return `HTTP ${status}`;
}

export function createAnthropicTransport(
  apiKey: string, opts: { readonly timeoutMs?: number; readonly fetchImpl?: typeof fetch } = {},
): Transport {
  const timeoutMs = opts.timeoutMs ?? 90_000;
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
      const text = textOf(body);
      return text === null
        ? { ok: false, kind: 'http', status: res.status, message: 'The API returned no text content.' }
        : { ok: true, text };
    } catch (e) {
      if (controller.signal.aborted) return { ok: false, kind: 'timeout', status: null, message: `No response within ${Math.round(timeoutMs / 1000)} seconds.` };
      return { ok: false, kind: 'network', status: null, message: e instanceof Error ? e.message : 'Network error' };
    } finally {
      clearTimeout(timer);
    }
  };
}
