import { useId, useState } from 'react';
import type { ScoringOutput } from '../data/types';
import { Button } from '../ui/primitives';
import { hasUnprintable } from './pdfText';
import type { PdfRecommendations } from './reportPdf';

/** Starts loading the PDF code in the background, so a download still works if the network drops later. */
export function preloadPdf(): void {
  void import('./reportPdf').catch(() => undefined);
}

/**
 * v1.2 C2 — "Download PDF". The company name is optional, held in this component's memory,
 * and used only in the PDF's title and file name: it never reaches the score or the prompt.
 */
export function SaveReport({ output, recommendations }: { output: ScoringOutput; recommendations: PdfRecommendations | null }) {
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; name: string } | { kind: 'error'; stage: 'load' | 'build' }>({ kind: 'idle' });
  const inputId = useId();

  const download = async () => {
    setStatus({ kind: 'busy' });
    // v1.3: tell a failed load (the PDF code never arrived) apart from a failed build.
    let mod: typeof import('./reportPdf');
    try {
      mod = await import('./reportPdf');
    } catch {
      setStatus({ kind: 'error', stage: 'load' });
      return;
    }
    try {
      const name = mod.downloadReportPdf({ output, companyName: company.trim() === '' ? null : company.trim(), date: new Date(), recommendations });
      setStatus({ kind: 'done', name });
    } catch {
      setStatus({ kind: 'error', stage: 'build' });
    }
  };

  return (
    <section className="rounded-xl border border-line bg-panel p-5 sm:p-6" aria-labelledby="save-report" data-testid="save-report">
      <h2 id="save-report" className="text-lg font-semibold text-ink">Save this report</h2>
      <p className="mt-1 text-sm text-ink-2">
        A PDF of everything above, made in your browser.{' '}
        {recommendations === null ? 'Generate recommendations first if you want them included.' : 'Your recommendations are included.'}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-ink">Company name <span className="font-normal text-ink-3">(optional, used only in the PDF)</span></label>
          <input id={inputId} type="text" value={company} maxLength={80} onChange={(e) => setCompany(e.target.value)} autoComplete="organization"
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none" data-testid="company-name" />
          {hasUnprintable(company) && (
            <p className="mt-1 text-xs text-ink-2" data-testid="company-name-warning">
              The PDF's built-in font covers Latin letters only; other characters will show as &ldquo;?&rdquo;. Consider a Latin spelling.
            </p>
          )}
        </div>
        <Button onClick={() => { void download(); }} disabled={status.kind === 'busy'}>
          {status.kind === 'busy' ? 'Preparing…' : 'Download PDF'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-3" aria-live="polite" data-testid="pdf-status">
        {status.kind === 'done' && <>Saved {status.name}.</>}
        {status.kind === 'error' && status.stage === 'load' && <>The PDF tool could not be loaded, so no file was made. Check your connection and reload the page; the report above is unaffected. You can also use your browser&rsquo;s Print &rarr; Save as PDF.</>}
        {status.kind === 'error' && status.stage === 'build' && <>The PDF could not be generated. The report above is unaffected; try again, or use your browser&rsquo;s Print &rarr; Save as PDF.</>}
      </p>
    </section>
  );
}
