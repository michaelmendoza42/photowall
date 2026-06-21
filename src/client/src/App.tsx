import { useEffect, useState } from 'react';
import { Providers } from './app/Providers.js';
import { readAppSurfaceFromLocation, type AppSurface } from './app/appSurface.js';
import { MosaicLabShell } from './features/mosaic-lab/MosaicLabShell.js';
import { WallShell } from './features/wall/WallShell.js';

function readInitialSurface(): AppSurface {
  if (typeof window === 'undefined') return 'wall';
  return readAppSurfaceFromLocation(window.location);
}

export function App(): JSX.Element {
  const [surface, setSurface] = useState<AppSurface>(readInitialSurface);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncSurface = () => {
      setSurface(readAppSurfaceFromLocation(window.location));
    };

    syncSurface();
    window.addEventListener('hashchange', syncSurface);
    return () => window.removeEventListener('hashchange', syncSurface);
  }, []);

  if (surface === 'mosaic-lab') {
    return <MosaicLabShell />;
  }

  return (
    <Providers>
      <WallShell />
    </Providers>
  );
}
