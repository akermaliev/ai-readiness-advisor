/**
 * v1.2 C2 — the report as a real PDF with selectable text, generated in the browser.
 *
 * Loaded only when the visitor asks for it (dynamic import), so jsPDF is not in the initial
 * bundle. Built from the same ScoringOutput the page renders, in the page's section order.
 *
 * Inputs are deliberately narrow: the scoring output, the optional company name, the date,
 * and — only if generated this session — the verified recommendations with the model id.
 * The API key is not an input, so it cannot reach the file.
 *
 * jsPDF's built-in Helvetica covers Windows-1252 only, so symbols outside it (sigma, arrows,
 * >=) are written as plain-text equivalents by `pdfText`.
 */
import { jsPDF } from 'jspdf';
import { SENSITIVITY_TARGET } from '../data/bands';
import type { GateResult, ScoringOutput } from '../data/types';
import type { VerifiedRecommendations } from '../model/gateVerification';
import { areaLabel, untilText } from '../model/display';
import { isFlatSensitivity } from '../model/summary';
import {
  bandFraming, categoryLabel, compensationText, dimensionLabel, dimensionName, gateEffectText, industryLabel, industryRationale, sizeLabel,
} from '../report/lookups';
import { APP_VERSION } from '../site';

export type PdfRecommendations =
  | { readonly kind: 'live'; readonly model: string; readonly generatedAt: Date; readonly result: VerifiedRecommendations }
  | { readonly kind: 'fallback'; readonly generatedAt: Date; readonly result: VerifiedRecommendations };

export interface PdfInput {
  readonly output: ScoringOutput;
  readonly companyName: string | null;
  readonly date: Date;
  readonly recommendations: PdfRecommendations | null;
}

const MAP: Readonly<Record<string, string>> = {
  'σ': 'sigma', 'Δ': 'delta', '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '−': '-',
  '≈': '~', '×': 'x', '✓': 'v', '‑': '-', ' ': ' ', ' ': ' ', ' ': ' ',
};
/** Text safe for the built-in PDF fonts (Windows-1252): known symbols spelled out, anything else outside it replaced. */
export function pdfText(s: string): string {
  const cp1252Extra = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  return Array.from(s.normalize('NFC')).map((ch) => {
    const mapped = MAP[ch];
    if (mapped !== undefined) return mapped;
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || cp1252Extra.includes(ch) || ch === '\n') return ch;
    return '?';
  }).join('');
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `ai-readiness-<company-or-industry>-<yyyy-mm-dd>.pdf` */
export function pdfFileName(output: ScoringOutput, companyName: string | null, date: Date): string {
  const base = (companyName !== null && companyName.trim() !== '' ? companyName : industryLabel(output.industry))
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    || 'report';
  return `ai-readiness-${base}-${isoDate(date)}.pdf`;
}

export const PDF_FOOTER = 'Directional self-assessment on unverified self-report. Not professional, legal or compliance advice.';

const PAGE = { w: 612, h: 792, margin: 54 } as const; // US Letter, points
const INK: [number, number, number] = [20, 20, 20];
const INK2: [number, number, number] = [85, 85, 80];
const INK3: [number, number, number] = [125, 125, 118];
const LINE: [number, number, number] = [220, 220, 214];
const ACCENT: [number, number, number] = [42, 120, 214];
const TRACK: [number, number, number] = [205, 226, 251];

class Writer {
  y: number = PAGE.margin;
  readonly width = PAGE.w - 2 * PAGE.margin;
  constructor(readonly doc: jsPDF) {}

  private ensure(h: number) {
    if (this.y + h > PAGE.h - PAGE.margin - 24) { this.doc.addPage(); this.y = PAGE.margin; }
  }
  space(h: number) { this.y += h; }
  text(s: string, o: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 10;
    const indent = o.indent ?? 0;
    this.doc.setFont('helvetica', o.bold === true ? 'bold' : 'normal').setFontSize(size).setTextColor(...(o.color ?? INK));
    const lines = this.doc.splitTextToSize(pdfText(s), this.width - indent) as string[];
    const lh = size * 1.35;
    for (const line of lines) {
      this.ensure(lh);
      this.doc.text(line, PAGE.margin + indent, this.y + size);
      this.y += lh;
    }
    this.y += o.gap ?? 2;
  }
  heading(s: string) {
    this.ensure(40);
    this.space(10);
    this.doc.setDrawColor(...LINE).setLineWidth(0.8).line(PAGE.margin, this.y, PAGE.w - PAGE.margin, this.y);
    this.space(8);
    this.text(s, { size: 13, bold: true, gap: 4 });
  }
  sub(s: string) { this.space(4); this.text(s, { size: 10.5, bold: true, gap: 2 }); }
  bullet(s: string, color: [number, number, number] = INK) {
    this.doc.setFont('helvetica', 'normal').setFontSize(10);
    const lines = this.doc.splitTextToSize(pdfText(s), this.width - 14) as string[];
    lines.forEach((line, i) => {
      this.ensure(13.5);
      this.doc.setTextColor(...color);
      if (i === 0) this.doc.text('-', PAGE.margin + 2, this.y + 10);
      this.doc.text(line, PAGE.margin + 14, this.y + 10);
      this.y += 13.5;
    });
    this.y += 1.5;
  }
  /** A contribution bar: track length = weight / maxWeight, fill = contribution / weight. */
  bar(fraction: number, trackFraction: number) {
    this.ensure(12);
    const w = this.width * 0.62 * trackFraction;
    this.doc.setFillColor(...TRACK).roundedRect(PAGE.margin, this.y, w, 7, 2, 2, 'F');
    if (fraction > 0) this.doc.setFillColor(...ACCENT).roundedRect(PAGE.margin, this.y, Math.max(2, w * fraction), 7, 2, 2, 'F');
    this.y += 11;
  }
}

const GATE_LABEL: Readonly<Record<Exclude<GateResult['status'], 'passed'>, string>> = {
  blocked: 'Blocked', 'warned-severe': 'Severe warning', warned: 'Warning',
};

export function buildReportPdf(input: PdfInput): jsPDF {
  const { output, recommendations } = input;
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  doc.setProperties({ title: `AI readiness report${input.companyName ? ` - ${pdfText(input.companyName)}` : ''}`, creator: `AI Readiness Advisor v${APP_VERSION}` });
  const w = new Writer(doc);

  // Cover block
  w.text('AI Readiness Report', { size: 20, bold: true, gap: 4 });
  if (input.companyName !== null && input.companyName.trim() !== '') w.text(input.companyName.trim(), { size: 13, gap: 4 });
  w.text(`${industryLabel(output.industry)} · company size ${sizeLabel(output.sizeBand)} · ${isoDate(input.date)} · AI Readiness Advisor v${APP_VERSION}`, { size: 9.5, color: INK2, gap: 8 });
  w.text('This is a directional input based on unverified self-report. Budget, timing, and internal context are not captured, and the decision rests with you. It is not professional, legal or compliance advice.', { size: 9.5, color: INK2, gap: 4 });

  // 1. Band and score
  w.heading('1. Readiness band and score');
  w.text(`${output.band.label} (band range ${output.band.lower}-${output.band.upper})`, { size: 14, bold: true, gap: 1 });
  w.text(bandFraming(output.band.label), { color: INK2, gap: 6 });
  w.text(`Headline score (weighted geometric mean): ${output.scoreGeometric}`, { bold: true });
  w.text(`Weighted average, for comparison: ${output.scoreArithmetic}`);
  w.text(`Gap: ${output.compensationGap} ${output.compensationGap === 1 ? 'point' : 'points'} (${output.compensationBand}). ${compensationText(output.compensationBand)}.`, { color: INK2 });
  const zeroed = output.dimensions.filter((d) => d.normalized === 0);
  if (zeroed.length > 0) {
    w.text(`${zeroed.map((d) => dimensionLabel(d.id)).join(', ')} ${zeroed.length === 1 ? 'scores' : 'score'} 0, so the floor sets your headline: read it as "this capability is missing", not as a precise measurement.`, { color: INK2 });
  }
  w.text(`Weighted for ${industryLabel(output.industry)}, company size ${sizeLabel(output.sizeBand)}. ${industryRationale(output.industry)}`, { size: 9, color: INK2 });

  // 2. Where the score comes from
  w.heading('2. Where the score comes from');
  w.text(`Each bar's full length is how much that dimension can contribute under your profile; the filled part is what it contributes to the weighted average of ${output.scoreArithmetic}.`, { size: 9.5, color: INK2, gap: 6 });
  const maxWeight = Math.max(...output.dimensions.map((d) => d.weight));
  for (const d of output.dimensions) {
    w.text(`${d.id} ${dimensionName(d.id)}: ${d.normalized}/100 · weight ${d.weight} · ${d.contribution.toFixed(1)} of ${d.weight} pts`, { gap: 1 });
    w.bar(d.weight === 0 ? 0 : d.contribution / d.weight, d.weight / maxWeight);
  }

  // 3. Diagnostics
  w.heading('3. Diagnostics');
  w.text(`Shape: ${output.dispersion.unbalanced ? 'unbalanced readiness' : 'balanced shape'}. Spread across dimensions: sigma ${output.dispersion.sigma.toFixed(1)}, range ${output.dispersion.range} points (flagged above sigma 20).`);
  w.text(`Largest weighted shortfall: ${dimensionName(output.bottleneck.dimensionId)}, ${output.bottleneck.weightedShortfall.toFixed(1)} points of the weighted average.`);
  w.sub(`Fix this first (raising each dimension to adequate, ${SENSITIVITY_TARGET}/100)`);
  const moves = output.sensitivity.filter((s) => s.delta > 0);
  if (moves.length === 0) w.text(`Every dimension is already at or above ${SENSITIVITY_TARGET}.`);
  moves.forEach((s, i) => w.text(`${i + 1}. ${dimensionName(s.dimensionId)}: ${output.scoreGeometric} -> ${output.scoreGeometric + s.delta} (+${s.delta})`, { indent: 8, gap: 1 }));
  if (isFlatSensitivity(output)) w.text('No dimension is a clear priority: every move here is worth 2 points or less, so the order comes down to rounding.', { color: INK2, gap: 2 });

  // 4. Gates, 5. confidence flags
  w.heading('4. Gates');
  const active = output.gates.filter((g) => g.status !== 'passed');
  const passed = output.gates.filter((g) => g.status === 'passed');
  if (active.length === 0) w.text('No gate is triggered by your answers.');
  for (const g of active) {
    w.sub(`${GATE_LABEL[g.status as Exclude<GateResult['status'], 'passed'>]} · ${g.id}`);
    w.text(gateEffectText(g.id), { gap: 1 });
    w.text(`Triggered by: ${g.condition}`, { size: 9, color: INK2, gap: 1 });
    w.text(`Applies to: ${g.affectedCategories === 'all' ? 'every recommendation' : g.affectedCategories.map(categoryLabel).join(', ')}`, { size: 9, color: INK2, gap: 1 });
    w.text(`What would clear it: ${g.unblockCondition}`, { gap: 3 });
  }
  if (passed.length > 0) w.text(`${passed.length} other gate${passed.length === 1 ? '' : 's'} checked and passed: ${passed.map((g) => g.id).join(', ')}.`, { size: 9, color: INK2 });
  if (output.confidenceFlags.length > 0) {
    w.heading('5. Low-confidence input');
    for (const f of output.confidenceFlags) w.bullet(`${f.id}: ${f.description}`);
    w.text('These flags never adjust the score. They mark answers worth double-checking.', { size: 9, color: INK2 });
  }

  // 6. Cross-profile
  w.heading('6. How much the weights matter');
  const scores = output.crossProfile.map((c) => c.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  w.text(`${min === max ? `Your answers score ${min} under every industry profile.` : `Your answers score ${min}-${max} depending on which industry profile is applied.`} Applied: ${industryLabel(output.industry)}. Weights are our own criticality estimates, not a validated standard.`);
  w.text(output.crossProfile.map((c) => `${industryLabel(c.industry)} ${c.score}`).join(' · '), { color: INK2 });
  w.text(`Company size held at ${sizeLabel(output.sizeBand)} for every profile.`, { size: 9, color: INK3 });

  // Recommendations, only if generated this session
  if (recommendations !== null) {
    const r = recommendations.result;
    w.heading('Recommendations');
    w.text(recommendations.kind === 'live'
      ? `Model-generated by ${recommendations.model} on ${isoDate(recommendations.generatedAt)}, then checked in code against your gates.`
      : `Pre-written examples for ${industryLabel(output.industry)}, not generated for your answers. Summary and roadmap computed from your score with no model involved.`,
    { size: 9.5, color: INK2, gap: 6 });
    w.sub('Your score in brief (computed from your assessment, no model involved)');
    w.text([...r.summary.sentences, ...(r.summary.flatNote === null ? [] : [r.summary.flatNote]), ...(r.summary.imbalanceNote === null ? [] : [r.summary.imbalanceNote])].join(' '));
    w.sub('Use cases');
    if (r.useCases.length === 0) w.text('No suggestion survived the gate check.');
    for (const item of r.useCases) {
      const u = item.useCase;
      w.text(`${u.title}${item.source === 'fixture' ? ' (back-office alternative)' : ''}`, { bold: true, gap: 1 });
      w.text(u.description, { gap: 1 });
      w.text(`Expected outcome: ${u.expectedOutcome}`, { gap: 1 });
      if (item.tradeoff !== null) w.text(`The tradeoff: ${item.tradeoff}`, { gap: 1 });
      w.text(`${u.outcomeConfidence} confidence · ${u.implementationRisk} implementation risk · depends on ${dimensionLabel(u.dependsOnDimension)} · area: ${areaLabel(u.targetFunction)}`, { size: 9, color: INK2, gap: 1 });
      w.text(`Gated kinds of work: ${u.categories.length === 0 ? 'touches no gated kind of work' : u.categories.map(categoryLabel).join(', ')}`, { size: 9, color: INK2, gap: 1 });
      for (const g of u.governanceFlags) w.text(`${g.type}: ${g.note}`, { size: 9, color: INK2, indent: 8, gap: 1 });
      w.space(5);
    }
    w.sub('Roadmap');
    if (r.roadmap.prerequisite !== null) w.text(`First, close this gap: ${r.roadmap.prerequisite}`);
    if (r.pilotBlocked) w.text(`The suggested pilot, "${r.roadmap.pilotFirst.useCaseTitle}", is blocked by a gate; see below for what would unblock it.`);
    else w.text(`Pilot first: ${r.roadmap.pilotFirst.useCaseTitle}. ${r.roadmap.pilotFirst.rationale}`);
    if (r.pilotDependsOnFixFirst !== null) w.text(`Note: the suggested pilot depends on ${dimensionLabel(r.pilotDependsOnFixFirst)}, the dimension to fix first.`, { color: INK2 });
    for (const d of r.roadmap.defer) w.bullet(`Defer ${d.useCaseTitle} until ${untilText(d.until)}.`);
    if (r.blocked.length > 0) {
      w.sub('Blocked, and what would unblock it');
      for (const b of r.blocked) {
        w.text(`${b.title} (${b.gateId})`, { bold: true, gap: 1 });
        w.text(b.description, { gap: 1 });
        w.text(`${categoryLabel(b.useCaseCategory)} · ${gateEffectText(b.gateId)}`, { size: 9, color: INK2, gap: 1 });
        w.text(`What would unblock it: ${b.unblockCondition}`, { gap: 4 });
      }
    }
  }

  // Footer on every page: short disclaimer and page numbers.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...INK3);
    doc.text(pdfText(PDF_FOOTER), PAGE.margin, PAGE.h - PAGE.margin + 18);
    doc.text(`Page ${i} of ${pages}`, PAGE.w - PAGE.margin, PAGE.h - PAGE.margin + 18, { align: 'right' });
  }
  return doc;
}

/** Build and hand the file to the browser. The anchor is created, clicked and removed; nothing is stored. */
export function downloadReportPdf(input: PdfInput): string {
  const name = pdfFileName(input.output, input.companyName, input.date);
  const blob = buildReportPdf(input).output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
