import { describe, expect, it } from 'vitest';
import { calibrationPersonas } from '../../data/calibrationPersonas';
import { computeReadiness } from '../../engine';
import { viewFromHash } from '../../landing/useHashView';
import { buildFallbackRecommendations } from '../../model/fallback';
import { buildRoadmapView } from '../../model/roadmapView';
import { APP_VERSION, CONTACT_URL, REPO_URL } from '../../site';
import { headerCsp, metaCsp, SECURITY_HEADERS } from '../../../security-policy';
import { buildReportPdf, pdfFileName, pdfText } from '../reportPdf';
import packageJson from '../../../package.json?raw';

const out = (id: string) => {
  const p = calibrationPersonas.find((x) => x.id === id);
  if (p === undefined) throw new Error(id);
  return computeReadiness(p.input);
};

describe('v1.2 C2 — PDF helpers', () => {
  it('writes symbols the built-in fonts cannot draw as plain text', () => {
    expect(pdfText('σ 9.9, 51 → 59, Q4.2 ≤ 4, gap ≥ 5, Δ')).toBe('sigma 9.9, 51 -> 59, Q4.2 <= 4, gap >= 5, delta');
    expect(pdfText('curly “quotes” — dash · dot é')).toBe('curly “quotes” — dash · dot é'); // all in Windows-1252
    expect(pdfText('emoji 🚀 and 汉字')).toBe('emoji ? and ??');
  });
  it('names the file ai-readiness-<company-or-industry>-<yyyy-mm-dd>.pdf', () => {
    const d = new Date(2026, 8, 30);
    expect(pdfFileName(out('strong'), 'Northbank & Co.', d)).toBe('ai-readiness-northbank-co-2026-09-30.pdf');
    expect(pdfFileName(out('median'), null, d)).toBe('ai-readiness-manufacturing-logistics-2026-09-30.pdf');
    expect(pdfFileName(out('median'), '   ', d)).toBe('ai-readiness-manufacturing-logistics-2026-09-30.pdf');
    expect(pdfFileName(out('median'), 'Café Münster', d)).toBe('ai-readiness-cafe-munster-2026-09-30.pdf');
  });
  it('builds a PDF for every persona, with and without recommendations', () => {
    for (const p of calibrationPersonas) {
      const o = computeReadiness(p.input);
      const bare = buildReportPdf({ output: o, companyName: null, date: new Date(), recommendations: null });
      expect(bare.getNumberOfPages()).toBeGreaterThanOrEqual(1);
      const recs = buildFallbackRecommendations(o, { primaryBottleneck: 'forecasting-planning', targetFunction: 'sales-marketing' }, p.input);
      const roadmap = buildRoadmapView(recs, o, p.input);
      const withRecs = buildReportPdf({ output: o, companyName: 'X', date: new Date(), recommendations: { kind: 'fallback', generatedAt: new Date(), result: recs, roadmap } });
      expect(withRecs.getNumberOfPages()).toBeGreaterThan(bare.getNumberOfPages() - 1);
      expect(withRecs.output()).toContain('%PDF-');
    }
  });
});

describe('v1.2 C1/C3 — site', () => {
  it('hash views', () => {
    expect(viewFromHash('#terms')).toBe('terms');
    expect(viewFromHash('#privacy')).toBe('privacy');
    expect(['', '#', '#anything'].map(viewFromHash)).toEqual(['main', 'main', 'main']);
  });
  it('APP_VERSION matches package.json', () => {
    const pkg = JSON.parse(packageJson) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });
  it('contact goes to the public repo\'s issue tracker, not a personal address', () => {
    expect(REPO_URL).toBe('https://github.com/akermaliev/ai-readiness-advisor');
    expect(CONTACT_URL).toBe(`${REPO_URL}/issues`);
  });
  it('CSP: only self and api.anthropic.com; frame-ancestors only in the header form', () => {
    expect(headerCsp()).toContain("connect-src 'self' https://api.anthropic.com");
    expect(headerCsp()).toContain("frame-ancestors 'none'");
    expect(metaCsp()).not.toContain('frame-ancestors');
    expect(headerCsp()).not.toMatch(/unsafe-inline|unsafe-eval|\*|blob:/);
    expect(Object.keys(SECURITY_HEADERS)).toEqual(['Content-Security-Policy', 'Referrer-Policy', 'X-Content-Type-Options', 'Permissions-Policy']);
  });
});
