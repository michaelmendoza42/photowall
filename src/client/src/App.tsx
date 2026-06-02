import { useEffect, useState } from 'react';
import { HealthBanner } from './components/HealthBanner.js';

export function App(): JSX.Element {
  const [mountedAt] = useState(() => new Date());
  useEffect(() => {
    document.body.dataset['appReady'] = 'true';
  }, []);
  return (
    <main className="app-shell" data-testid="app-shell">
      <header className="app-shell__header">
        <span className="app-shell__brand">photo-wall</span>
        <span className="app-shell__phase">phase 2 · bootstrap shell</span>
      </header>
      <section className="app-shell__placeholder" aria-live="polite">
        <h1>Wall not yet wired</h1>
        <p>
          The full-viewport app shell is mounted. The justified-row wall,
          panning, hover, modal, and filter UI ship in later mission tasks.
        </p>
        <p className="app-shell__meta">
          shell mounted at <time dateTime={mountedAt.toISOString()}>{mountedAt.toISOString()}</time>
        </p>
      </section>
      <HealthBanner />
    </main>
  );
}
