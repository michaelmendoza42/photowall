import { describe, expect, it } from 'vitest';
import type { FolderFacet } from '../../../../shared/api/library.js';
import { folderSelectionIncludes } from '../../../../shared/api/photos.js';
import {
  buildFolderTree,
  folderCheckStates,
  folderDisplayStates,
  toggleFolderInTree,
  type FolderSelection,
} from '../folderTree.js';

function facet(path: string, directPhotoCount: number, photoCount: number): FolderFacet {
  return { path, depth: path === '' ? 0 : path.split('/').length, directPhotoCount, photoCount };
}

// As the curator sees it: hidden photos count only toward `_hidden`.
const FOLDERS: FolderFacet[] = [
  facet('', 0, 7),
  facet('2024', 0, 7),
  facet('2024/trip', 4, 4),
  facet('2024/trip/_hidden', 2, 2),
  facet('2024/wedding', 3, 3),
  facet('2024/gone', 0, 0),
  facet('2024/gone/_hidden', 5, 5),
];

const tree = buildFolderTree(FOLDERS);
const NONE: FolderSelection = { folders: [], excludeFolders: [] };

describe('_hidden folders in selections', () => {
  it('are left out when a parent is selected', () => {
    expect(folderSelectionIncludes('2024/trip/_hidden', ['2024'], [])).toBe(false);
    expect(folderSelectionIncludes('2024/trip/_hidden', ['2024/trip'], [])).toBe(false);
    expect(folderSelectionIncludes('2024/trip/_hidden', [], [])).toBe(false);
  });

  it('are included only by a rule on the _hidden folder itself', () => {
    expect(folderSelectionIncludes('2024/trip/_hidden', ['2024/trip/_hidden'], [])).toBe(true);
    expect(folderSelectionIncludes('2024/trip', ['2024/trip/_hidden'], [])).toBe(false);
  });
});

describe('folder tree with _hidden folders', () => {
  it('keeps an album whose photos are all hidden, holding its _hidden folder', () => {
    const y2024 = tree.find((node) => node.path === '2024')!;
    const gone = y2024.children.find((node) => node.path === '2024/gone')!;
    expect(gone.children.map((node) => [node.path, node.hidden])).toEqual([
      ['2024/gone/_hidden', true],
    ]);
  });

  it('shows a selected parent as fully selected without its _hidden child', () => {
    const states = folderCheckStates(tree, { folders: ['2024/trip'], excludeFolders: [] });
    expect(states.get('2024/trip')).toBe('all');
    expect(states.get('2024/trip/_hidden')).toBe('none');
  });

  const includes = (selection: FolderSelection, path: string) =>
    folderSelectionIncludes(path, selection.folders, selection.excludeFolders);

  it('selecting a parent does not select its _hidden child', () => {
    const next = toggleFolderInTree(tree, NONE, '2024/trip');
    expect(includes(next, '2024/trip')).toBe(true);
    expect(includes(next, '2024/trip/_hidden')).toBe(false);
    expect(includes(next, '2024/wedding')).toBe(false);
  });

  it('selects a _hidden folder on its own, even under a selected parent', () => {
    const parent = toggleFolderInTree(tree, NONE, '2024/trip');
    const both = toggleFolderInTree(tree, parent, '2024/trip/_hidden');
    expect(includes(both, '2024/trip')).toBe(true);
    expect(includes(both, '2024/trip/_hidden')).toBe(true);
    expect(folderCheckStates(tree, both).get('2024/trip/_hidden')).toBe('all');

    // Deselecting the parent leaves the hidden folder as it was.
    const hiddenOnly = toggleFolderInTree(tree, both, '2024/trip');
    expect(includes(hiddenOnly, '2024/trip')).toBe(false);
    expect(includes(hiddenOnly, '2024/trip/_hidden')).toBe(true);

    // Selecting the whole year still leaves hidden photos out.
    const year = toggleFolderInTree(tree, NONE, '2024');
    expect(includes(year, '2024/wedding')).toBe(true);
    expect(includes(year, '2024/gone/_hidden')).toBe(false);
    expect(folderCheckStates(tree, year).get('2024')).toBe('all');
  });
});

describe('folderDisplayStates', () => {
  it('rolls up which albums are on display, ignoring _hidden folders', () => {
    const states = folderDisplayStates(tree, new Set(['2024/trip']));
    expect(states.get('2024/trip')).toBe('all');
    expect(states.get('2024/wedding')).toBe('none');
    expect(states.get('2024')).toBe('partial');
    expect(states.has('2024/trip/_hidden')).toBe(false);

    const all = folderDisplayStates(tree, new Set(['2024/trip', '2024/wedding']));
    expect(all.get('2024')).toBe('all');
  });
});
