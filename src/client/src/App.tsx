import { Providers } from './app/Providers.js';
import { WallShell } from './features/wall/WallShell.js';

export function App(): JSX.Element {
  return (
    <Providers>
      <WallShell />
    </Providers>
  );
}
