import { useId, useState } from 'react';
import { WHY_SOURCE } from '../site';
import { Button } from '../ui/primitives';

/**
 * v1.2 C1 — the first screen for a visitor with no context. One screen of reading, then an
 * acknowledgement. The acknowledgement lives in memory only (no storage), so the landing page
 * returns after a refresh; that is accepted.
 */
export function Landing({ onStart }: { onStart: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const checkboxId = useId();
  return (
    <div className="rounded-xl border border-line bg-panel p-5 sm:p-7" data-testid="landing">
      <h1 className="text-2xl font-semibold text-ink">Is your company ready for AI?</h1>
      <p className="mt-3 text-base text-ink">
        A free self-assessment that scores whether a company&rsquo;s foundations are ready for AI, shows exactly how the
        score was built, and flags what not to attempt yet.
      </p>

      <h2 className="mt-7 text-sm font-semibold uppercase tracking-wide text-ink-3">Why it exists</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        Many companies are adopting AI because everyone else is, without a plan for where it fits or what has to be true
        first. This tool asks about the foundations (data, systems, processes, governance, people and sponsorship) before
        any use case gets picked. In MIT NANDA&rsquo;s 2025 study, &ldquo;95% of organizations are getting zero return&rdquo;
        from their generative AI spending. That comes from 52 interviews, a survey of 153 leaders and about 300 public
        deployments, with success judged by the organizations themselves, so it describes a pattern, not a cause.{' '}
        <a className="text-accent underline underline-offset-2" href={WHY_SOURCE.url} target="_blank" rel="noopener noreferrer">
          Read the report
        </a>{' '}
        <span className="text-ink-3">(copy hosted by a third party)</span>.
      </p>

      <h2 className="mt-7 text-sm font-semibold uppercase tracking-wide text-ink-3">How to use it</h2>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-2" data-testid="how-to">
        <li>Answer 24 questions about current practice. It takes about 10 minutes, and works best answered by one person who knows the process you want to improve.</li>
        <li>Read the report: your score, how it was built, what to fix first, and what not to attempt yet.</li>
        <li>Optionally, add your own Anthropic API key for recommendations tailored to your answers, or use the pre-written examples.</li>
        <li>Download the report as a PDF.</li>
      </ol>

      <p className="mt-6 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink" data-testid="privacy-line">
        Everything is computed in your browser. Nothing is sent anywhere unless you add an API key.{' '}
        <a className="text-accent underline underline-offset-2" href="#privacy">Privacy</a>
      </p>

      <div className="mt-6 flex items-start gap-3">
        <input id={checkboxId} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-accent" data-testid="acknowledge" />
        <label htmlFor={checkboxId} className="text-sm text-ink">
          I understand this is a directional self-assessment, not professional, legal or compliance advice.{' '}
          <a className="text-accent underline underline-offset-2" href="#terms">Read the Terms</a>
        </label>
      </div>
      <div className="mt-5">
        <Button onClick={onStart} disabled={!agreed}>Start the assessment</Button>
      </div>
    </div>
  );
}
