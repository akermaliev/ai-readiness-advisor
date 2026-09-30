import { useEffect, useState } from 'react';

/** In-app views reachable by hash links, so a static host needs no rewrite rules. */
export type View = 'main' | 'terms' | 'privacy';

export function viewFromHash(hash: string): View {
  if (hash === '#terms') return 'terms';
  if (hash === '#privacy') return 'privacy';
  return 'main';
}

/** The current view, following `#terms` / `#privacy`. Reads the URL only; stores nothing. */
export function useHashView(): View {
  const [view, setView] = useState<View>(() => viewFromHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      const next = viewFromHash(window.location.hash);
      setView(next);
      if (next !== 'main') window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return view;
}
