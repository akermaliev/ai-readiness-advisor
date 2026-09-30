import { APP_VERSION, REPO_URL } from '../site';

export function Footer() {
  return (
    <footer className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-xs text-ink-3" data-testid="footer">
      <a className="hover:text-ink underline-offset-2 hover:underline" href="#terms">Terms</a>
      <a className="hover:text-ink underline-offset-2 hover:underline" href="#privacy">Privacy</a>
      {REPO_URL !== null && <a className="hover:text-ink underline-offset-2 hover:underline" href={REPO_URL} rel="noopener noreferrer">Source</a>}
      <span>v{APP_VERSION}</span>
    </footer>
  );
}
