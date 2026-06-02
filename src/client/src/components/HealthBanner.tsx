import { useEffect, useState } from 'react';
import {
  HEALTHZ_PATH,
  type HealthResponse,
} from '../../../shared/api/health.js';

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'error'; message: string };

export function HealthBanner(): JSX.Element {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(HEALTHZ_PATH, { headers: { accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        return (await res.json()) as HealthResponse;
      })
      .then((data) => {
        if (!cancelled) setState({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'unknown error',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="app-shell__health" data-testid="health-banner">
      {state.kind === 'loading' && <span>checking backend health…</span>}
      {state.kind === 'ok' && (
        <span>
          backend ok · v{state.data.version} · uptime {state.data.uptimeSeconds}s
        </span>
      )}
      {state.kind === 'error' && (
        <span className="app-shell__health--error">
          backend unreachable: {state.message}
        </span>
      )}
    </footer>
  );
}
