import type { ReactNode } from 'react';
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED, LEGAL_TEXT_REVIEWED } from '../site';

/**
 * v1.2 C1 — Terms and Privacy as in-app views at #terms and #privacy.
 *
 * DRAFT TEXT. Written from the build prompt's outline; it has not been reviewed by anyone
 * qualified and is not presented as legally sufficient. While LEGAL_TEXT_REVIEWED is false,
 * both views say so on the page.
 */
function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-xl border border-line bg-panel p-5 sm:p-7" data-testid={`legal-${title.toLowerCase()}`}>
      <a href="#" className="text-sm text-accent underline underline-offset-2" data-testid="legal-back">&larr; Back</a>
      <h1 className="mt-3 text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-1 text-xs text-ink-3">Last updated {LEGAL_LAST_UPDATED}</p>
      {!LEGAL_TEXT_REVIEWED && (
        <p className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink" data-testid="legal-draft">
          Draft. This text has not yet been reviewed by a qualified professional.
        </p>
      )}
      <div className="mt-5 space-y-5 text-sm leading-relaxed text-ink-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        {children}
      </div>
    </article>
  );
}

const contact = CONTACT_EMAIL === null
  ? <>A contact address will be added before launch.</>
  : <>Questions: <a className="text-accent underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</>;

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
          The site does not store or transmit your answers. The score and report are computed in your browser and are gone
          when you refresh or close the page. See the <a className="text-accent underline" href="#privacy">Privacy</a> page.
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
          <li>The request contains your key (as a header), your scores, your selected answers and what you said you want from AI. Anthropic handles it under <a className="text-accent underline" href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">its own privacy policy</a>.</li>
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
