/**
 * Re-key stars, private flags, edits, album settings and share links after
 * reorganizing the photo library on disk. See src/server/curation/reconcile.ts
 * for the matching rules.
 *
 *   npm run curation:reconcile                 # dry run: report only
 *   npm run curation:reconcile -- --apply      # back up, rewrite, record the index
 *
 * Options:
 *   --library <dir>    library root (default: PHOTO_WALL_HOST_LIBRARY_PATH, else the snapshot's libraryRoot)
 *   --curation <dir>   curation folder (default: <data>/curation)
 *   --snapshot <file>  extra pre-move snapshot to learn old file sizes from (repeatable)
 *
 * Run it with --apply once before reorganizing too: that records every
 * file's size in curation/library-index.json, which makes matching exact
 * even after the servers have rescanned.
 */
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { isHiddenName, isSupportedImageFilename } from '../src/server/scanner/supported.js';
import {
  planReconcile,
  type CurationState,
  type FileFingerprint,
  type LibraryIndex,
} from '../src/server/curation/reconcile.js';

const INDEX_FILE = 'library-index.json';

interface Args {
  apply: boolean;
  library?: string;
  curation?: string;
  snapshots: string[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dataRoot = path.resolve(process.env.PHOTO_WALL_HOST_DATA_PATH ?? '.photo-wall-data');
  const curationRoot = path.resolve(args.curation ?? path.join(dataRoot, 'curation'));
  const dataSnapshot = path.join(dataRoot, 'snapshot.json');
  const libraryRoot = path.resolve(
    args.library ??
      process.env.PHOTO_WALL_HOST_LIBRARY_PATH ??
      ((await readJson(dataSnapshot)) as { libraryRoot?: string } | null)?.libraryRoot ??
      fail('library root unknown: pass --library <dir>'),
  );

  console.log(`library   ${libraryRoot}`);
  console.log(`curation  ${curationRoot}`);

  const current = await walkLibrary(libraryRoot);
  console.log(`indexed   ${current.size} photos`);

  // What the library looked like before: snapshots first, the recorded index wins.
  const previous = new Map<string, FileFingerprint>();
  for (const file of [dataSnapshot, ...args.snapshots]) {
    const snap = (await readJson(file)) as { photos?: { relativePath: string; fileSize: number; mtimeMs: number }[] } | null;
    for (const p of snap?.photos ?? []) previous.set(p.relativePath, { size: p.fileSize, mtimeMs: p.mtimeMs });
  }
  const recorded = (await readJson(path.join(curationRoot, INDEX_FILE))) as { photos?: Record<string, [number, number]> } | null;
  for (const [p, [size, mtimeMs]] of Object.entries(recorded?.photos ?? {})) previous.set(p, { size, mtimeMs });

  const files = {
    starred: path.join(curationRoot, 'starred.json'),
    private: path.join(curationRoot, 'private.json'),
    edits: path.join(curationRoot, 'edits.json'),
    albums: path.join(curationRoot, 'albums.json'),
  };
  const starredBody = (await readJson(files.starred)) as { photos: string[] } | null;
  const privateBody = (await readJson(files.private)) as { photos: string[] } | null;
  const editsBody = (await readJson(files.edits)) as { edits: Record<string, unknown> } | null;
  const albumsBody = (await readJson(files.albums)) as { onDisplay: string[]; defaultView: string[] } | null;
  const shareFiles = await listJson(path.join(curationRoot, 'shares'));
  const shareBodies = await Promise.all(shareFiles.map(async (f) => (await readJson(f)) as ShareBody));

  const state: CurationState = {
    starred: new Set(starredBody?.photos ?? []),
    private: new Set(privateBody?.photos ?? []),
    edits: editsBody?.edits ?? {},
    onDisplay: albumsBody?.onDisplay ?? [],
    defaultView: albumsBody?.defaultView ?? [],
    shares: shareBodies,
  };

  const plan = await planReconcile({
    state,
    previous,
    current,
    sameContent: async (paths) => {
      const hashes = await Promise.all(paths.map((p) => sha1(path.join(libraryRoot, p))));
      return hashes.every((h) => h === hashes[0]);
    },
  });

  report(state, plan);

  if (!args.apply) {
    console.log('\nDry run: nothing written. Re-run with --apply to rewrite curation and record the library index.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(curationRoot, 'backups', `reconcile-${stamp}`);
  await fs.mkdir(path.join(backupDir, 'shares'), { recursive: true });
  for (const f of [...Object.values(files), ...shareFiles]) {
    const rel = path.relative(curationRoot, f);
    await fs.copyFile(f, path.join(backupDir, rel)).catch(() => undefined);
  }

  const { next } = plan;
  if (starredBody) await writeIfChanged(files.starred, starredBody, { ...starredBody, photos: [...next.starred].sort() });
  if (privateBody) await writeIfChanged(files.private, privateBody, { ...privateBody, photos: [...next.private].sort() });
  if (editsBody) await writeIfChanged(files.edits, editsBody, { ...editsBody, edits: next.edits });
  if (albumsBody) {
    await writeIfChanged(files.albums, albumsBody, { ...albumsBody, onDisplay: next.onDisplay, defaultView: next.defaultView });
  }
  for (const [i, file] of shareFiles.entries()) {
    const before = shareBodies[i]!;
    const after = next.shares[i]!;
    await writeIfChanged(file, before, { ...before, folders: after.folders, excludeFolders: after.excludeFolders, anchorPhotoId: after.anchorPhotoId });
  }

  const index = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    libraryRoot,
    photos: Object.fromEntries([...current].sort(([a], [b]) => a.localeCompare(b)).map(([p, f]) => [p, [f.size, f.mtimeMs]])),
  };
  await writeAtomically(path.join(curationRoot, INDEX_FILE), JSON.stringify(index));

  console.log(`\nApplied. Backup: ${backupDir}`);
  console.log(`Recorded ${current.size} photos in ${path.join(curationRoot, INDEX_FILE)}.`);
  console.log('Rescan the library in the app (or restart the server) so the wall shows the new folders.');
}

interface ShareBody {
  id: string;
  folders: string[];
  excludeFolders: string[];
  anchorPhotoId: string | null;
  [key: string]: unknown;
}

function report(state: CurationState, plan: Awaited<ReturnType<typeof planReconcile>>): void {
  const curated = new Set([...state.starred, ...state.private, ...Object.keys(state.edits)]);
  const tags = (p: string): string =>
    [state.starred.has(p) && 'star', state.private.has(p) && 'private', p in state.edits && 'edit'].filter(Boolean).join(',');

  const rows = [...plan.photos].filter(([p]) => curated.has(p));
  const moved = rows.filter(([, r]) => r.kind === 'moved');
  const ambiguous = rows.filter(([, r]) => r.kind === 'ambiguous');
  const missing = rows.filter(([, r]) => r.kind === 'missing');

  console.log(`\nPhotos with curation at an old path: ${rows.length}`);
  for (const [p, r] of moved) if (r.kind === 'moved') console.log(`  moved     [${tags(p)}] ${p}\n         -> ${r.to.join('\n         -> ')}   (${r.how})`);
  for (const [p, r] of ambiguous) if (r.kind === 'ambiguous') console.log(`  AMBIGUOUS [${tags(p)}] ${p}\n         ?? ${r.candidates.join('\n         ?? ')}`);
  for (const [p] of missing) console.log(`  MISSING   [${tags(p)}] ${p}  (kept as is)`);
  for (const c of plan.editConflicts) console.log(`  EDIT KEPT ${c.to} already has an edit; not overwritten by ${c.from}`);

  if (plan.folders.size > 0) {
    console.log(`\nFolders in album settings or share links that no longer exist: ${plan.folders.size}`);
    for (const [f, r] of plan.folders) {
      if (r.kind === 'moved') console.log(`  moved     ${f} -> ${r.to}`);
      else if (r.kind === 'ambiguous') console.log(`  AMBIGUOUS ${f} split across: ${r.candidates.join(', ')}  (kept as is)`);
      else console.log(`  MISSING   ${f}  (kept as is)`);
    }
  }
  if (rows.length === 0 && plan.folders.size === 0) console.log('Nothing to move: all curation points at existing files.');
}

async function walkLibrary(root: string): Promise<LibraryIndex> {
  const index = new Map<string, FileFingerprint>();
  async function visit(rel: string): Promise<void> {
    const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (isHiddenName(entry.name)) return;
        const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) return visit(childRel);
        if (!entry.isFile() || !isSupportedImageFilename(entry.name)) return;
        const stat = await fs.stat(path.join(root, childRel));
        index.set(childRel, { size: stat.size, mtimeMs: stat.mtimeMs });
      }),
    );
  }
  await visit('');
  return index;
}

function sha1(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    createReadStream(file).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function listJson(dir: string): Promise<string[]> {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  return names.filter((n) => n.endsWith('.json')).sort().map((n) => path.join(dir, n));
}

async function writeIfChanged(file: string, before: unknown, after: unknown): Promise<void> {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  // Same layout the server writes, so diffs stay readable.
  const pretty = path.dirname(file).endsWith('shares') ? JSON.stringify(after) : `${JSON.stringify(after, null, 2)}\n`;
  await writeAtomically(file, pretty);
  console.log(`wrote     ${file}`);
}

async function writeAtomically(file: string, contents: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, contents);
  await fs.rename(tmp, file);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, snapshots: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--library') args.library = argv[++i];
    else if (a === '--curation') args.curation = argv[++i];
    else if (a === '--snapshot') args.snapshots.push(argv[++i]!);
    else fail(`unknown option: ${a}`);
  }
  return args;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
