import type { ReactNode } from 'react';
import { CONTACT_URL, LEGAL_AUTHOR, LEGAL_LAST_UPDATED } from '../site';

/**
 * v1.2 C1 — Terms and Privacy as in-app views at #terms and #privacy. Written by the tool's
 * author, who is named on both views (v1.3).
 */
function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-xl border border-line bg-panel p-5 sm:p-7" data-testid={`legal-${title.toLowerCase()}`}>
      <a href="#" className="text-sm text-accent underline underline-offset-2" data-testid="legal-back">&larr; Back</a>
      <h1 className="mt-3 text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-1 text-xs text-ink-3" data-testid="legal-author">Written by {LEGAL_AUTHOR}, the author of this tool. Last updated {LEGAL_LAST_UPDATED}.</p>
      <div className="mt-5 space-y-5 text-sm leading-relaxed text-ink-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        {children}
      </div>
    </article>
  );
}

const contact = (
  <>Questions or concerns: open an issue on <a className="text-accent underline" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">GitHub</a>.</>
);

export function TermsView() {
  return (
    <LegalPage title="Terms">
      <section>
        <h2>What this tool is</h2>
        <p>
          AI Readiness Advisor is a free, directional self-assessment. It is a heuristic built on a reasoned rubric and on
          answers you give about your own organization, which it cannot verify. It is not legal, compliance, financial or
          other professional advice, and it does not tell you whether to adopt AI. Any decision you make is yours.
        </p>
      </section>
      <section>
        <h2>No data collection</h2>
        <p>
          The site does not store your answers or send them to us. The score and report are computed in your browser and are
          gone when you refresh or close the page. If you add your own API key, your answers and scores are sent from your
          browser to Anthropic to generate recommendations, and nowhere else. See the{' '}
          <a className="text-accent underline" href="#privacy">Privacy</a> page.
        </p>
      </section>
      <section>
        <h2>Your API key and model output</h2>
        <ul>
          <li>Recommendations are optional and need your own Anthropic API key. The key is held only in your browser&rsquo;s memory and sent only to Anthropic&rsquo;s API.</li>
          <li>Usage is billed to your Anthropic account under Anthropic&rsquo;s terms. We recommend a dedicated key that you can revoke, with a spending limit.</li>
          <li>Model output can be wrong. The site checks its structure, the dimension names it uses and the gates it must respect, not whether its suggestions are true or suitable for you.</li>
        </ul>
      </section>
      <section>
        <h2>No warranty and limitation of liability</h2>
        <p>
          The tool is provided &ldquo;as is&rdquo;, without warranty of any kind. To the extent the law allows, the author is
          not liable for any loss or damage arising from its use or from decisions made with it.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>{contact}</p>
      </section>
    </LegalPage>
  );
}

export function PrivacyView() {
  return (
    <LegalPage title="Privacy">
      <section>
        <h2>What stays in your browser</h2>
        <ul>
          <li>Your answers, your score, the report and the PDF are all produced in your browser.</li>
          <li>They are kept in the page&rsquo;s memory only and are gone when you refresh, close the tab or press &ldquo;Start over&rdquo;.</li>
          <li>The site sets no cookies, uses no browser storage, and loads no analytics, trackers, fonts or scripts from anyone else.</li>
          <li>An optional company name is used only in the PDF&rsquo;s title and file name.</li>
        </ul>
      </section>
      <section>
        <h2>If you add an API key</h2>
        <ul>
          <li>Your browser sends the request straight to Anthropic&rsquo;s API (api.anthropic.com). Nothing passes through this site.</li>
          <li>The request contains your key (as a header), your scores, your selected answers and what you said you want from AI. Anthropic handles it under the terms of your Anthropic API account and <a className="text-accent underline" href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">its privacy policy</a>.</li>
          <li>The key is never stored, logged or written into the PDF.</li>
        </ul>
      </section>
      <section>
        <h2>The host</h2>
        <p>Like any website, the service that hosts these files may keep standard server logs, such as IP addresses and the time of requests.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>{contact}</p>
      </section>
    </LegalPage>
  );
}
