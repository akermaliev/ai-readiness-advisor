import { useMemo, useState } from 'react';
import type { ProblemStatement, ReadinessInput } from './data/types';
import { computeReadiness } from './engine';
import { IntakeWizard } from './intake/IntakeWizard';
import { Footer } from './landing/Footer';
import { Landing } from './landing/Landing';
import { PrivacyView, TermsView } from './landing/Legal';
import { useHashView } from './landing/useHashView';
import { Recommendations } from './model/Recommendations';
import type { PdfRecommendations } from './pdf/reportPdf';
import { preloadPdf, SaveReport } from './pdf/SaveReport';
import { Report } from './report/Report';
import { Button } from './ui/primitives';

interface Session {
  /** Profile + rubric inputs: the only things the score is computed from. */
  readonly readiness: ReadinessInput;
  /** Intent inputs: never passed to the engine. */
  readonly problem: ProblemStatement;
}

export function App() {
  const view = useHashView();
  // In memory only (no storage): the landing page returns after a refresh, by design.
  const [acknowledged, setAcknowledged] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [pdfRecs, setPdfRecs] = useState<PdfRecommendations | null>(null);
  // Pure and synchronous: the report exists the moment the form is submitted.
  const output = useMemo(() => (session === null ? null : computeReadiness(session.readiness)), [session]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-8 sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-ink">AI Readiness Advisor</p>
          <p className="text-xs text-ink-2">Scored in your browser. Nothing leaves this page unless you add an API key.</p>
        </div>
        {view === 'main' && session !== null && (
          <Button variant="secondary" onClick={() => { setSession(null); window.scrollTo({ top: 0 }); }}>Start over</Button>
        )}
      </header>

      {/* Kept mounted while Terms or Privacy is open, so reading them never loses your answers. */}
      <main hidden={view !== 'main'}>
        {!acknowledged ? (
          <Landing onStart={() => { setAcknowledged(true); preloadPdf(); window.scrollTo({ top: 0 }); }} />
        ) : session === null || output === null ? (
          <IntakeWizard onSubmit={(readiness, problem) => { setSession({ readiness, problem }); setPdfRecs(null); window.scrollTo({ top: 0 }); }} />
        ) : (
          <Report output={output}>
            <Recommendations output={output} problem={session.problem} answers={session.readiness} onResult={setPdfRecs} />
            <SaveReport output={output} recommendations={pdfRecs} />
          </Report>
        )}
      </main>
      {view === 'terms' && <TermsView />}
      {view === 'privacy' && <PrivacyView />}

      <Footer />
    </div>
  );
}
