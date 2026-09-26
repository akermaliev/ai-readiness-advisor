import { useMemo, useState } from 'react';
import type { ProblemStatement, ReadinessInput } from './data/types';
import { computeReadiness } from './engine';
import { IntakeWizard } from './intake/IntakeWizard';
import { Report } from './report/Report';
import { Button } from './ui/primitives';

interface Session {
  /** Profile + rubric inputs: the only things the score is computed from. */
  readonly readiness: ReadinessInput;
  /** Intent inputs: never passed to the engine. */
  readonly problem: ProblemStatement;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  // Pure and synchronous: the report exists the moment the form is submitted.
  const output = useMemo(() => (session === null ? null : computeReadiness(session.readiness)), [session]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-ink">AI Readiness Advisor</p>
          <p className="text-xs text-ink-2">Scored in your browser. Nothing leaves this page unless you add an API key.</p>
        </div>
        {session !== null && (
          <Button variant="secondary" onClick={() => { setSession(null); window.scrollTo({ top: 0 }); }}>Start over</Button>
        )}
      </header>
      {session === null || output === null ? (
        <IntakeWizard onSubmit={(readiness, problem) => { setSession({ readiness, problem }); window.scrollTo({ top: 0 }); }} />
      ) : (
        <Report output={output} />
      )}
    </div>
  );
}
