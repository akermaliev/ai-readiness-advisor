/**
 * Stage 1 — pre-written back-office alternative use cases, one per industry.
 *
 * Resolved open item, per both source docs: authored as fixtures rather than
 * generated live, so the back-office nudge stays consistent across demo runs.
 * Stage 5 injects the matching fixture into `useCases` when the nudge is active
 * (target function = sales & marketing, or customer-facing).
 *
 * ── AUTHORED CONTENT ──────────────────────────────────────────────────────────
 * Unlike every other file in this stage, this one is not a transcription. The
 * methodology resolves that five fixtures exist and what shape they take, but
 * supplies no text. The content below is written against the MIT finding the
 * nudge rests on: measurable returns cluster in back-office work — document
 * automation, procurement, risk review — while over 50% of 2025 AI budgets went
 * to high-visibility, low-ROI sales and marketing pilots. Read these five on
 * their merits; there is nothing to diff them against.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every fixture carries `isBackOfficeAlternative: true` and at least one
 * `UseCaseCategory`, per the Model Output Contract. Note that a category is what
 * makes a use case gate-checkable, so a fixture can itself be dropped by an
 * active gate at Stage 5 — see the note at the foot of this file.
 */

import type { IndustryId, ModelUseCase } from './types';

export const backOfficeExamples = {
  'tech-saas': {
    title: 'Internal support ticket deflection from existing documentation',
    description:
      'Answer inbound internal IT and product support tickets from existing runbooks, past resolved tickets, and product docs, escalating anything the sources do not cover.',
    categories: ['retrieval-over-internal-content'],
    targetFunction: 'back office / operations',
    expectedOutcome:
      'Support engineers spend their time on novel issues rather than re-answering documented ones.',
    outcomeConfidence: 'high',
    implementationRisk: 'low',
    riskDrivers: [
      'Answer quality tracks documentation quality — stale runbooks produce confidently wrong answers',
      'Needs a clear escalation path or users lose trust after the first bad answer',
    ],
    governanceFlags: [
      {
        type: 'reliability',
        note: 'Retrieval over stale internal docs returns outdated answers with no visible signal that they are stale.',
      },
    ],
    dependsOnDimension: 'D2',
    isBackOfficeAlternative: true,
  },
  healthcare: {
    title: 'Prior-authorization packet assembly',
    description:
      'Assemble prior-authorization submissions by pulling the required clinical documentation, payer-specific forms, and supporting records into a draft packet for staff review before submission.',
    categories: ['retrieval-over-internal-content', 'phi-touching'],
    targetFunction: 'back office / operations',
    expectedOutcome:
      'Authorization packets go out same-day instead of queueing, and fewer are returned incomplete.',
    outcomeConfidence: 'medium',
    implementationRisk: 'medium',
    riskDrivers: [
      'Touches PHI, so it inherits the full data handling and access control bar',
      'Payer requirements change without notice and the assembly rules drift with them',
    ],
    governanceFlags: [
      {
        type: 'data-sensitivity',
        note: 'Handles PHI throughout; requires a written handling policy and audited access before any pilot.',
      },
      {
        type: 'oversight',
        note: 'Administrative rather than clinical, but a human must review every packet before submission.',
      },
    ],
    dependsOnDimension: 'D4',
    isBackOfficeAlternative: true,
  },
  financial: {
    title: 'Vendor contract and invoice review',
    description:
      'Review inbound vendor invoices against contract terms, flagging rate mismatches, out-of-scope line items, and duplicate billing for the finance team to action.',
    categories: ['retrieval-over-internal-content', 'entity-resolution'],
    targetFunction: 'finance',
    expectedOutcome:
      'Billing discrepancies are caught before payment rather than during an annual audit.',
    outcomeConfidence: 'high',
    implementationRisk: 'low',
    riskDrivers: [
      'Requires reliable matching between invoices and the contracts they bill against',
      'Vendor naming and entity variation across systems drives most false matches',
    ],
    governanceFlags: [
      {
        type: 'reliability',
        note: 'A missed discrepancy is silent; the process needs sampling against manual review to stay honest.',
      },
    ],
    dependsOnDimension: 'D1',
    isBackOfficeAlternative: true,
  },
  'retail-ecommerce': {
    title: 'Supplier invoice and returns documentation triage',
    description:
      'Classify and route inbound supplier invoices, chargebacks, and returns paperwork, extracting the fields the finance and operations teams re-key by hand today.',
    categories: ['retrieval-over-internal-content', 'entity-resolution'],
    targetFunction: 'back office / operations',
    expectedOutcome:
      'Returns and chargeback paperwork clears in hours rather than sitting in a shared inbox.',
    outcomeConfidence: 'high',
    implementationRisk: 'low',
    riskDrivers: [
      'Document formats vary by supplier and change without warning',
      'Depends on a consistent supplier and SKU reference to route correctly',
    ],
    governanceFlags: [
      {
        type: 'reliability',
        note: 'Extraction errors propagate into financial records; needs confidence thresholds and a human queue.',
      },
    ],
    dependsOnDimension: 'D1',
    isBackOfficeAlternative: true,
  },
  'manufacturing-logistics': {
    title: 'Procurement document and purchase order reconciliation',
    description:
      'Reconcile purchase orders, goods-received notes, and supplier invoices as a three-way match, surfacing only the exceptions for a buyer to resolve.',
    categories: ['retrieval-over-internal-content', 'entity-resolution'],
    targetFunction: 'supply chain',
    expectedOutcome:
      'Buyers review exceptions only, and payment holds from unmatched paperwork drop.',
    outcomeConfidence: 'high',
    implementationRisk: 'medium',
    riskDrivers: [
      'Three-way matching needs a consistent part and supplier identifier across all three documents',
      'Partial deliveries and substitutions are the common case, not the edge case',
    ],
    governanceFlags: [
      {
        type: 'reliability',
        note: 'An incorrect auto-match releases payment for goods not received; exceptions must fail open to a human.',
      },
    ],
    dependsOnDimension: 'D1',
    isBackOfficeAlternative: true,
  },
} as const satisfies Record<IndustryId, ModelUseCase>;

/**
 * Note for Stage 5.
 *
 * Every fixture carries `retrieval-over-internal-content`, which is honest — each
 * one reads existing internal documents — but it also means G-U1 blocks all five
 * when Q2.3 = 0 (permissions never audited), and G-H1 blocks the healthcare
 * fixture when Q4.1 ≤ 1. That is correct gate behavior, not a bug in the fixtures,
 * but it collides with the Technical Requirements' stated reason for pre-writing
 * them: "keeps the nudge present and consistent on every run". Stage 5 has to
 * decide what the nudge does when the injected fixture is itself gated — most
 * likely surface it in `blockedAcknowledged` with its unblock condition, which
 * preserves the nudge's point (here is the higher-ROI alternative, and here is
 * what stands between you and it) rather than silently dropping it.
 */
