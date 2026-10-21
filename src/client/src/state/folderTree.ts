// Folder tree for the album picker.
//
// The picker shows the discovered folders as a tree. Toggling a folder
// selects or deselects it together with everything beneath it, and the
// result is stored as the shared include/exclude folder rules (see
// `folderSelectionIncludes`), so a nested folder can be deselected while
// its parent stays selected.

import type { FolderFacet } from '../../../shared/api/library.js';
import { folderSelectionIncludes } from '../../../shared/api/photos.js';

export interface FolderTreeNode {
  path: string;
  name: string;
  directPhotoCount: number;
  photoCount: number;
  children: FolderTreeNode[];
}

export interface FolderSelection {
  folders: readonly string[];
  excludeFolders: readonly string[];
}

export type FolderCheckState = 'all' | 'partial' | 'none';

/**
 * Build the tree of photo-bearing folders. Returns the top-level
 * folders; the library root itself is left out.
 */
export function buildFolderTree(folders: readonly FolderFacet[]): FolderTreeNode[] {
  const nodes = new Map<string, FolderTreeNode>();
  const sorted = folders
    .filter((f) => f.path.length > 0 && f.photoCount > 0)
    .slice()
    .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
  const roots: FolderTreeNode[] = [];

  for (const facet of sorted) {
    const node: FolderTreeNode = {
      path: facet.path,
      name: facet.path.split('/').at(-1) ?? facet.path,
      directPhotoCount: facet.directPhotoCount,
      photoCount: facet.photoCount,
      children: [],
    };
    nodes.set(facet.path, node);
    const parent = nearestAncestor(facet.path, nodes);
    (parent ? parent.children : roots).push(node);
  }

  const byName = (a: FolderTreeNode, b: FolderTreeNode): number =>
    a.name.localeCompare(b.name, undefined, { numeric: true });
  roots.sort(byName);
  for (const node of nodes.values()) node.children.sort(byName);
  return roots;
}

/** Check state of every folder in the tree, keyed by path. */
export function folderCheckStates(
  roots: readonly FolderTreeNode[],
  selection: FolderSelection,
): Map<string, FolderCheckState> {
  const states = new Map<string, FolderCheckState>();
  const visit = (node: FolderTreeNode): number => {
    let selected = isDirectSelected(node.path, selection) ? node.directPhotoCount : 0;
    for (const child of node.children) selected += visit(child);
    states.set(
      node.path,
      selected === 0 ? 'none' : selected >= node.photoCount ? 'all' : 'partial',
    );
    return selected;
  };
  for (const root of roots) visit(root);
  return states;
}

/**
 * Toggle a folder and everything beneath it: a fully selected folder
 * is deselected, anything else becomes fully selected. Returns the
 * smallest include/exclude rule set describing the new selection.
 */
export function toggleFolderInTree(
  roots: readonly FolderTreeNode[],
  selection: FolderSelection,
  path: string,
): { folders: string[]; excludeFolders: string[] } {
  const target = folderCheckStates(roots, selection).get(path);
  const selectTarget = target !== 'all';

  // Whether each folder's own photos are selected after the toggle.
  const flags = new Map<string, boolean>();
  const assign = (node: FolderTreeNode, forced: boolean | null): void => {
    const own = forced ?? (node.path === path ? selectTarget : null);
    flags.set(node.path, own ?? isDirectSelected(node.path, selection));
    for (const child of node.children) assign(child, own);
  };
  for (const root of roots) assign(root, null);

  // A folder with no photos of its own takes the side most of its photos
  // are on, which keeps the rule set short: picking every child collapses
  // into one rule on the parent, and deselecting one child of a picked
  // parent becomes a single exclusion.
  const normalize = (node: FolderTreeNode): number => {
    const childSelected = node.children.reduce((sum, child) => sum + normalize(child), 0);
    if (node.directPhotoCount === 0) {
      flags.set(node.path, childSelected * 2 > node.photoCount);
    }
    return childSelected + (flags.get(node.path) === true ? node.directPhotoCount : 0);
  };
  for (const root of roots) normalize(root);

  const folders: string[] = [];
  const excludeFolders: string[] = [];
  const emit = (node: FolderTreeNode, parentFlag: boolean): void => {
    const flag = flags.get(node.path) === true;
    if (flag !== parentFlag) (flag ? folders : excludeFolders).push(node.path);
    for (const child of node.children) emit(child, flag);
  };
  for (const root of roots) emit(root, false);

  return { folders: folders.sort(), excludeFolders: excludeFolders.sort() };
}

function isDirectSelected(path: string, selection: FolderSelection): boolean {
  // An empty selection shows the whole library, but in the picker it
  // reads as nothing picked yet.
  if (selection.folders.length === 0) return false;
  return folderSelectionIncludes(path, selection.folders, selection.excludeFolders);
}

function nearestAncestor(
  path: string,
  nodes: ReadonlyMap<string, FolderTreeNode>,
): FolderTreeNode | null {
  const segments = path.split('/');
  for (let length = segments.length - 1; length > 0; length--) {
    const ancestor = nodes.get(segments.slice(0, length).join('/'));
    if (ancestor) return ancestor;
  }
  return null;
}
