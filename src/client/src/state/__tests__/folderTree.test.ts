import { describe, expect, it } from 'vitest';
import type { FolderFacet } from '../../../../shared/api/library.js';
import { folderSelectionIncludes } from '../../../../shared/api/photos.js';
import {
  buildFolderTree,
  folderCheckStates,
  toggleFolderInTree,
  type FolderSelection,
} from '../folderTree.js';

function facet(path: string, directPhotoCount: number, photoCount: number): FolderFacet {
  return { path, depth: path === '' ? 0 : path.split('/').length, directPhotoCount, photoCount };
}

const FOLDERS: FolderFacet[] = [
  facet('', 0, 12),
  facet('2024', 0, 10),
  facet('2024/trip', 3, 5),
  facet('2024/trip/favs', 2, 2),
  facet('2024/wedding', 5, 5),
  facet('2023', 0, 2),
  facet('2023/party', 2, 2),
  facet('2022', 0, 0),
];

const tree = buildFolderTree(FOLDERS);
const NONE: FolderSelection = { folders: [], excludeFolders: [] };

describe('folder selection rules', () => {
  it('lets the deepest covering rule win', () => {
    const include = ['2024', '2024/trip/favs'];
    const exclude = ['2024/trip'];
    expect(folderSelectionIncludes('2024/wedding', include, exclude)).toBe(true);
    expect(folderSelectionIncludes('2024/trip', include, exclude)).toBe(false);
    expect(folderSelectionIncludes('2024/trip/favs', include, exclude)).toBe(true);
    expect(folderSelectionIncludes('2023/party', include, exclude)).toBe(false);
    expect(folderSelectionIncludes('2024-old', include, exclude)).toBe(false);
  });

  it('starts from the whole library when nothing is included', () => {
    expect(folderSelectionIncludes('2023/party', [], [])).toBe(true);
    expect(folderSelectionIncludes('2023/party', [], ['2023'])).toBe(false);
  });
});

describe('folder tree', () => {
  it('nests photo-bearing folders under their top-level folder', () => {
    expect(tree.map((node) => node.path)).toEqual(['2023', '2024']);
    const year = tree.find((node) => node.path === '2024')!;
    expect(year.children.map((node) => node.path)).toEqual(['2024/trip', '2024/wedding']);
    expect(year.children[0]!.children.map((node) => node.path)).toEqual(['2024/trip/favs']);
  });

  it('selects a top-level folder with everything inside it', () => {
    const next = toggleFolderInTree(tree, NONE, '2024');
    expect(next).toEqual({ folders: ['2024'], excludeFolders: [] });
    const states = folderCheckStates(tree, next);
    expect(states.get('2024')).toBe('all');
    expect(states.get('2024/trip/favs')).toBe('all');
    expect(states.get('2023')).toBe('none');
  });

  it('marks the parent partial when a nested folder is deselected', () => {
    const year = toggleFolderInTree(tree, NONE, '2024');
    const next = toggleFolderInTree(tree, year, '2024/trip/favs');
    expect(next).toEqual({ folders: ['2024'], excludeFolders: ['2024/trip/favs'] });
    const states = folderCheckStates(tree, next);
    expect(states.get('2024')).toBe('partial');
    expect(states.get('2024/trip')).toBe('partial');
    expect(states.get('2024/wedding')).toBe('all');
    expect(states.get('2024/trip/favs')).toBe('none');
  });

  it('selects a partial folder fully when toggled', () => {
    const partial = { folders: ['2024'], excludeFolders: ['2024/trip/favs'] };
    expect(toggleFolderInTree(tree, partial, '2024')).toEqual({
      folders: ['2024'],
      excludeFolders: [],
    });
  });

  it('collapses picking every child into the parent and back to nothing', () => {
    let selection = toggleFolderInTree(tree, NONE, '2024/trip');
    selection = toggleFolderInTree(tree, selection, '2024/wedding');
    expect(selection).toEqual({ folders: ['2024'], excludeFolders: [] });
    selection = toggleFolderInTree(tree, selection, '2024/trip');
    selection = toggleFolderInTree(tree, selection, '2024/wedding');
    expect(selection).toEqual({ folders: [], excludeFolders: [] });
  });

  it('re-selects a folder nested inside a deselected one', () => {
    let selection = toggleFolderInTree(tree, NONE, '2024');
    selection = toggleFolderInTree(tree, selection, '2024/trip');
    selection = toggleFolderInTree(tree, selection, '2024/trip/favs');
    expect(selection).toEqual({
      folders: ['2024', '2024/trip/favs'],
      excludeFolders: ['2024/trip'],
    });
    expect(folderCheckStates(tree, selection).get('2024/trip')).toBe('partial');
  });
});
