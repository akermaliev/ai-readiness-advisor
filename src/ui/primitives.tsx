import type { ReactNode } from 'react';

export type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'info';

const TONE_COLOR: Readonly<Record<Tone, string>> = {
  good: 'text-good', warning: 'text-warning', serious: 'text-serious', critical: 'text-critical', info: 'text-accent',
};

/** Status is never carried by color alone: every status icon ships with a text label. */
export function StatusIcon({ tone }: { tone: Tone }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, className: `shrink-0 ${TONE_COLOR[tone]}` } as const;
  switch (tone) {
    case 'critical':
      return (<svg {...common}><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M3.5 12.5l9-9" stroke="currentColor" strokeWidth="2" /></svg>);
    case 'serious':
    case 'warning':
      return (<svg {...common}><path d="M8 1.5L15 14H1z" fill="currentColor" /><path d="M8 6v3.5M8 11.2v.3" stroke="var(--panel)" strokeWidth="1.8" strokeLinecap="round" /></svg>);
    case 'good':
      return (<svg {...common}><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M4.8 8.2l2.2 2.2 4.2-4.6" fill="none" stroke="var(--panel)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>);
    case 'info':
      return (<svg {...common}><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M8 7.2v4M8 4.6v.3" stroke="var(--panel)" strokeWidth="1.8" strokeLinecap="round" /></svg>);
  }
}

export function StatusLabel({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
      <StatusIcon tone={tone} />
      {children}
    </span>
  );
}

export function Section({ index, title, kicker, children }: { index: number; title: string; kicker?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 sm:p-6" aria-labelledby={`section-${index}`}>
      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{kicker ?? 'Deterministic · computed in your browser'}</p>
        <h2 id={`section-${index}`} className="mt-1 text-lg font-semibold text-ink">{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function Callout({ tone, title, children }: { tone: Tone; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <StatusLabel tone={tone}>{title}</StatusLabel>
      {children !== undefined && <div className="mt-1.5 pl-[22px] text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function Button({ children, onClick, variant = 'primary', disabled = false, type = 'button' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; type?: 'button' | 'submit';
}) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent-strong disabled:bg-line disabled:text-ink-3',
    secondary: 'border border-line bg-panel text-ink hover:border-ink-3 disabled:text-ink-3',
    ghost: 'text-ink-2 hover:text-ink disabled:text-ink-3',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${styles}`}>
      {children}
    </button>
  );
}

export function RadioOption({ name, checked, onSelect, label, detail }: {
  name: string; checked: boolean; onSelect: () => void; label: string; detail?: string;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5 transition ${checked ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-ink-3'}`}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5 size-4 shrink-0 accent-accent" />
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {detail !== undefined && <span className="mt-0.5 block text-xs leading-relaxed text-ink-2">{detail}</span>}
      </span>
    </label>
  );
}
