import { useId, useState } from 'react';
import type { ScoringOutput } from '../data/types';
import { Button } from '../ui/primitives';
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
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; name: string } | { kind: 'error' }>({ kind: 'idle' });
  const inputId = useId();

  const download = async () => {
    setStatus({ kind: 'busy' });
    try {
      const { downloadReportPdf } = await import('./reportPdf');
      const name = downloadReportPdf({ output, companyName: company.trim() === '' ? null : company.trim(), date: new Date(), recommendations });
      setStatus({ kind: 'done', name });
    } catch {
      setStatus({ kind: 'error' });
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
        </div>
        <Button onClick={() => { void download(); }} disabled={status.kind === 'busy'}>
          {status.kind === 'busy' ? 'Preparing…' : 'Download PDF'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-3" aria-live="polite" data-testid="pdf-status">
        {status.kind === 'done' && <>Saved {status.name}.</>}
        {status.kind === 'error' && <>The PDF could not be generated. The report above is unaffected; try again, or use your browser&rsquo;s Print &rarr; Save as PDF.</>}
      </p>
    </section>
  );
}
