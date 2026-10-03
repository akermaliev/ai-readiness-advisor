/**
 * Text safe for jsPDF's built-in fonts, which cover Windows-1252 only. Kept apart from
 * reportPdf.ts so the page can check a company name without loading jsPDF (v1.3).
 */
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

/** True when `pdfText` would have to replace some of `s` with "?" (e.g. Cyrillic or CJK). */
export function hasUnprintable(s: string): boolean {
  return pdfText(s).split('?').length !== s.normalize('NFC').split('?').length;
}
