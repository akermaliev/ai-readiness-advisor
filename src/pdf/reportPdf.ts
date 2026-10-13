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
import type { RoadmapView } from '../model/roadmapView';
import { areaLabel, untilText } from '../model/display';
import { isFlatSensitivity } from '../model/summary';
import {
  bandFraming, categoryLabel, compensationText, dimensionLabel, dimensionName, gateEffectText, industryLabel, industryRationale, sizeLabel,
} from '../report/lookups';
import { APP_VERSION } from '../site';
import { pdfText } from './pdfText';

export { pdfText } from './pdfText';

export type PdfRecommendations =
  | { readonly kind: 'live'; readonly model: string; readonly generatedAt: Date; readonly result: VerifiedRecommendations; readonly roadmap: RoadmapView }
  | { readonly kind: 'fallback'; readonly generatedAt: Date; readonly result: VerifiedRecommendations; readonly roadmap: RoadmapView };

export interface PdfInput {
  readonly output: ScoringOutput;
  readonly companyName: string | null;
  readonly date: Date;
  readonly recommendations: PdfRecommendations | null;
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
  // Numbered in order of what is present: the low-confidence section only appears when a check trips (v1.3).
  let section = 5;
  if (output.confidenceFlags.length > 0) {
    w.heading(`${section++}. Low-confidence input`);
    for (const f of output.confidenceFlags) w.bullet(`${f.id}: ${f.description}`);
    w.text('These flags never adjust the score. They mark answers worth double-checking.', { size: 9, color: INK2 });
  }

  // 6. Cross-profile
  w.heading(`${section}. How much the weights matter`);
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
    // v1.3: the roadmap first, as numbered steps; the use cases follow as its detail.
    const rm = recommendations.roadmap;
    w.sub('Roadmap');
    const s1 = rm.step1.title;
    w.text(`Step 1. ${s1}`, { bold: true, gap: 1 });
    if (rm.step1.text !== null) w.text(rm.step1.text, { gap: 1 });
    if (rm.step1.note !== null) w.text(rm.step1.note, { color: INK2, gap: 1 });
    const path = rm.step1.path;
    if (path !== null && path.steps.length > 0) {
      w.text('One way to get there, from your own answers (computed, no model involved):', { size: 9, color: INK2, gap: 1 });
      path.steps.forEach((s, i) => w.text(
        `${i + 1}. Q${s.questionId} ${s.question} From "${s.fromLabel}" to "${s.toLabel}". ${dimensionLabel(path.dimensionId)} ${s.dimensionAfter}/100, headline ${s.headlineAfter}.${s.gatesCleared.length > 0 ? ` Clears ${s.gatesCleared.join(', ')}.` : ''}`,
        { indent: 8, gap: 1 }));
      const last = path.steps[path.steps.length - 1];
      w.text(path.reachesTarget
        ? `Together: ${dimensionLabel(path.dimensionId)} from ${path.dimensionBefore} to ${last?.dimensionAfter ?? path.dimensionBefore}, headline from ${path.headlineBefore} to ${last?.headlineAfter ?? path.headlineBefore}. Each change raises one answer as little as possible; other routes exist.`
        : `Even with every answer in ${dimensionLabel(path.dimensionId)} at its top option, it stays below ${path.target}.`, { size: 9, color: INK2 });
    }
    w.space(4);
    const s2 = rm.step2;
    w.text(s2.blocked ? 'Step 2. Pilot' : `Step 2. Pilot: ${s2.title}`, { bold: true, gap: 1 });
    if (s2.blocked) w.text(`The suggested pilot, "${s2.title}", is blocked by a gate; see below for what would unblock it.`);
    else {
      w.text(s2.rationale, { gap: 1 });
      if (s2.timing === 'alongside' && rm.step1.dimension !== null) w.text(`Can start now, alongside step 1: it does not depend on ${dimensionLabel(rm.step1.dimension)}.`, { gap: 1 });
      if (s2.goalNote !== null) w.text(`Why not start with your stated goal: ${s2.goalNote}`, { gap: 1 });
      w.text(`How to tell it worked: ${s2.successMeasure}`, { gap: 1 });
      w.text(`When to stop or rethink: ${s2.stopCondition}`, { gap: 1 });
    }
    if (r.pilotDependsOnFixFirst !== null) w.text(`Note: the suggested pilot depends on ${dimensionLabel(r.pilotDependsOnFixFirst)}, the dimension to fix first.`, { color: INK2 });
    if (rm.step3.length > 0) {
      w.space(4);
      w.text('Step 3. Later', { bold: true, gap: 1 });
      for (const d of rm.step3) {
        w.bullet(`Defer ${d.title} until ${untilText(d.until)}.${d.unlock.length > 0 ? ` Waits on: ${d.unlock.map((u) => `Q${u.questionId} (now: "${u.current}")`).join('; ')}.` : ''}`);
      }
    }
    w.sub('Use cases');
    if (r.useCases.length === 0) w.text('No suggestion survived the gate check.');
    for (const item of r.useCases) {
      const u = item.useCase;
      w.text(`${u.title}${item.source === 'fixture' ? ' (back-office alternative)' : ''}`, { bold: true, gap: 1 });
      w.text(u.description, { gap: 1 });
      w.text(`Expected outcome: ${u.expectedOutcome}`, { gap: 1 });
      if (item.tradeoff !== null) w.text(`The tradeoff: ${item.tradeoff}`, { gap: 1 });
      w.text(`${u.outcomeConfidence} confidence · ${u.implementationRisk} implementation risk · depends on ${dimensionLabel(u.dependsOnDimension)} · area: ${areaLabel(u.targetFunction)}`, { size: 9, color: INK2, gap: 1 });
      w.text(`Kinds of work the gates check: ${u.categories.length === 0 ? 'none' : u.categories.map(categoryLabel).join(', ')}`, { size: 9, color: INK2, gap: 1 });
      for (const g of u.governanceFlags) w.text(`${g.type}: ${g.note}`, { size: 9, color: INK2, indent: 8, gap: 1 });
      w.space(5);
    }
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
