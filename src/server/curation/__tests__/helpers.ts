import path from 'node:path';
import type { LibraryService } from '../../snapshots/library-service.js';
import { CurationService } from '../service.js';

/** A curation service with curation off, as on a server without a PIN. */
export async function curationOff(
  library: LibraryService,
  dataRoot: string,
): Promise<CurationService> {
  const curation = new CurationService({
    library,
    curationRoot: path.join(dataRoot, 'curation'),
    curatorPin: null,
    libraryWrites: false,
  });
  await curation.initialize();
  return curation;
}
