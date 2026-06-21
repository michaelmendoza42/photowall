import { hashStringToUint32 } from '../../wall/seeded.js';
import {
  createPackedTileRect,
  MOSAIC_LAB_GEOMETRY_EPSILON,
  type MosaicLabPackedTileRect,
  type MosaicLabPackingContract,
} from './geometry.js';
import {
  computeMosaicLabMetrics,
  getHorizontalSeamSegments,
  getVerticalSeamSegments,
  type MosaicLabMetricsSummary,
} from './metrics.js';
import {
  MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY,
} from './registry.js';
import type {
  MosaicLabCategoryFamily,
  MosaicLabExpandedRecipeRecord,
  MosaicLabFootprintDefinition,
  MosaicLabFootprintKey,
  MosaicLabSyntheticSourceTileRecord,
} from './types.js';

export interface MosaicLabFootprintGridSpan {
  columns: number;
  rows: number;
}

export interface MosaicLabPackerSettings {
  cellSize: number;
  maxTileCount?: number;
}

export interface MosaicLabPackerGrid {
  cellSize: number;
  columns: number;
  rows: number;
}

export interface MosaicLabPackedTile extends MosaicLabPackedTileRect {
  sourceTile: MosaicLabSyntheticSourceTileRecord;
  sourceIndex: number;
  footprint: MosaicLabFootprintDefinition;
  gridRect: MosaicLabFootprintGridSpan & {
    x: number;
    y: number;
  };
}

export interface MosaicLabPackerBaseResult {
  recipeKey: MosaicLabExpandedRecipeRecord['key'];
  seed: string;
  contract: MosaicLabPackingContract;
  settings: Readonly<Required<MosaicLabPackerSettings>>;
  grid: Readonly<MosaicLabPackerGrid>;
  sourceTiles: readonly MosaicLabSyntheticSourceTileRecord[];
  packedTiles: readonly MosaicLabPackedTile[];
  unpackedTiles: readonly MosaicLabSyntheticSourceTileRecord[];
}

export interface MosaicLabPackerPackedResult extends MosaicLabPackerBaseResult {
  status: 'packed';
  metrics: MosaicLabMetricsSummary;
}

export interface MosaicLabPackerFailedResult extends MosaicLabPackerBaseResult {
  status: 'failed';
  failureReason: string;
}

export type MosaicLabPackerResult = MosaicLabPackerPackedResult | MosaicLabPackerFailedResult;

interface SearchState {
  occupancy: (string | null)[][];
  orderedTiles: readonly OrderedTile[];
  placedTiles: MosaicLabPackedTile[];
  packedTileIds: Set<string>;
  seed: string;
  grid: MosaicLabPackerGrid;
}

interface SearchControl {
  nodesVisited: number;
  exactSolutionsFound: number;
  bestSolution: SearchSolution | null;
  truncated: boolean;
}

interface SearchSolution {
  packedTiles: readonly MosaicLabPackedTile[];
  score: number;
  fingerprint: string;
}

interface OrderedTile {
  tile: MosaicLabSyntheticSourceTileRecord;
  sourceIndex: number;
  rank: number;
}

interface CandidatePlacement {
  footprintKey: MosaicLabFootprintKey;
  footprint: MosaicLabFootprintDefinition;
  categoryFamily: MosaicLabCategoryFamily;
  gridRect: MosaicLabPackedTile['gridRect'];
  localSeamLength: number;
}

interface SearchBranch {
  orderedTile: OrderedTile;
  candidate: CandidatePlacement;
  branchScore: number;
}

const DEFAULT_MAX_TILE_COUNT = 16;
const MAX_SEARCH_NODES = 12_000;
const MAX_EXACT_SOLUTIONS = 128;

const FOOTPRINT_GRID_SPANS = Object.freeze<Record<MosaicLabFootprintKey, MosaicLabFootprintGridSpan>>({
  'standard-landscape': { columns: 4, rows: 3 },
  'standard-portrait': { columns: 3, rows: 4 },
  'large-landscape': { columns: 8, rows: 5 },
  'large-portrait': { columns: 5, rows: 8 },
  'square-rescue': { columns: 4, rows: 4 },
  'wide-landscape-seam-break': { columns: 16, rows: 9 },
  'tall-portrait-seam-break': { columns: 9, rows: 16 },
});

const CATEGORY_PRIORITY: Record<MosaicLabCategoryFamily, number> = {
  Standard: 0,
  'Scale rescue': 1,
  'Neutral connector': 2,
  'Seam-break rescue': 3,
};

function assertPositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than 0`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function toGridDimension(value: number, cellSize: number, label: string): number {
  const scaled = value / cellSize;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > MOSAIC_LAB_GEOMETRY_EPSILON) {
    throw new Error(`${label} must be an exact multiple of cellSize`);
  }
  assertPositiveNumber(rounded, label);
  return rounded;
}

function normalizeSettings(
  settings: MosaicLabPackerSettings,
  totalTileCount: number,
): Required<MosaicLabPackerSettings> {
  assertPositiveNumber(settings.cellSize, 'cellSize');

  const maxTileCount = settings.maxTileCount ?? Math.min(totalTileCount, DEFAULT_MAX_TILE_COUNT);
  assertNonNegativeInteger(maxTileCount, 'maxTileCount');

  return Object.freeze({
    cellSize: settings.cellSize,
    maxTileCount,
  });
}

function buildGrid(
  contract: MosaicLabPackingContract,
  settings: Required<MosaicLabPackerSettings>,
): MosaicLabPackerGrid {
  return Object.freeze({
    cellSize: settings.cellSize,
    columns: toGridDimension(contract.frame.width, settings.cellSize, 'frame.width'),
    rows: toGridDimension(contract.frame.height, settings.cellSize, 'frame.height'),
  });
}

function orderTiles(
  recipe: MosaicLabExpandedRecipeRecord,
  seed: string,
  maxTileCount: number,
): OrderedTile[] {
  return recipe.sourceTiles
    .map((tile, sourceIndex) => ({
      tile,
      sourceIndex,
      rank: hashStringToUint32(`mosaic-lab-packer:${seed}:${tile.id}:${sourceIndex}`),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return left.sourceIndex - right.sourceIndex;
    })
    .slice(0, maxTileCount);
}

function createOccupancy(grid: MosaicLabPackerGrid): (string | null)[][] {
  return Array.from({ length: grid.rows }, () => Array.from({ length: grid.columns }, () => null));
}

function findFirstEmptyCell(occupancy: (string | null)[][]): { x: number; y: number } | null {
  for (let y = 0; y < occupancy.length; y += 1) {
    const row = occupancy[y];
    if (!row) {
      continue;
    }

    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === null) {
        return { x, y };
      }
    }
  }

  return null;
}

function canPlaceAt(
  occupancy: (string | null)[][],
  gridRect: MosaicLabPackedTile['gridRect'],
): boolean {
  for (let y = gridRect.y; y < gridRect.y + gridRect.rows; y += 1) {
    const row = occupancy[y];
    if (!row) {
      return false;
    }

    for (let x = gridRect.x; x < gridRect.x + gridRect.columns; x += 1) {
      if (row[x] !== null) {
        return false;
      }
    }
  }

  return true;
}

function markPlacement(
  occupancy: (string | null)[][],
  gridRect: MosaicLabPackedTile['gridRect'],
  tileId: string,
): void {
  for (let y = gridRect.y; y < gridRect.y + gridRect.rows; y += 1) {
    const row = occupancy[y]!;
    for (let x = gridRect.x; x < gridRect.x + gridRect.columns; x += 1) {
      row[x] = tileId;
    }
  }
}

function unmarkPlacement(
  occupancy: (string | null)[][],
  gridRect: MosaicLabPackedTile['gridRect'],
): void {
  for (let y = gridRect.y; y < gridRect.y + gridRect.rows; y += 1) {
    const row = occupancy[y]!;
    for (let x = gridRect.x; x < gridRect.x + gridRect.columns; x += 1) {
      row[x] = null;
    }
  }
}

function measureLocalSharedSeam(
  occupancy: (string | null)[][],
  gridRect: MosaicLabPackedTile['gridRect'],
): number {
  let longest = 0;

  if (gridRect.x > 0) {
    let shared = 0;
    for (let y = gridRect.y; y < gridRect.y + gridRect.rows; y += 1) {
      if (occupancy[y]?.[gridRect.x - 1] !== null) {
        shared += 1;
      }
    }
    longest = Math.max(longest, shared);
  }

  if (gridRect.y > 0) {
    let shared = 0;
    for (let x = gridRect.x; x < gridRect.x + gridRect.columns; x += 1) {
      if (occupancy[gridRect.y - 1]?.[x] !== null) {
        shared += 1;
      }
    }
    longest = Math.max(longest, shared);
  }

  return longest;
}

function getPlacementCandidates(
  anchor: { x: number; y: number },
  tile: MosaicLabSyntheticSourceTileRecord,
  state: SearchState,
): CandidatePlacement[] {
  const candidates: CandidatePlacement[] = [];

  for (const footprintKey of tile.eligibleFootprintKeys) {
    const span = FOOTPRINT_GRID_SPANS[footprintKey];
    const footprint = MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY[footprintKey];
    const gridRect = {
      x: anchor.x,
      y: anchor.y,
      columns: span.columns,
      rows: span.rows,
    };

    if (
      gridRect.x + gridRect.columns > state.grid.columns ||
      gridRect.y + gridRect.rows > state.grid.rows ||
      !canPlaceAt(state.occupancy, gridRect)
    ) {
      continue;
    }

    candidates.push({
      footprintKey,
      footprint,
      categoryFamily: footprint.categoryFamily,
      gridRect,
      localSeamLength: measureLocalSharedSeam(state.occupancy, gridRect),
    });
  }

  return candidates.sort((left, right) => {
    const leftCategoryPriority = CATEGORY_PRIORITY[left.categoryFamily];
    const rightCategoryPriority = CATEGORY_PRIORITY[right.categoryFamily];
    if (leftCategoryPriority !== rightCategoryPriority) {
      return rightCategoryPriority - leftCategoryPriority;
    }
    if (left.localSeamLength !== right.localSeamLength) {
      return left.localSeamLength - right.localSeamLength;
    }
    if (left.footprintKey === tile.preferredFootprintKey && right.footprintKey !== tile.preferredFootprintKey) {
      return -1;
    }
    if (right.footprintKey === tile.preferredFootprintKey && left.footprintKey !== tile.preferredFootprintKey) {
      return 1;
    }
    const leftArea = left.gridRect.columns * left.gridRect.rows;
    const rightArea = right.gridRect.columns * right.gridRect.rows;
    if (leftArea !== rightArea) {
      return rightArea - leftArea;
    }
    const leftRank = hashStringToUint32(
      `mosaic-lab-packer:${state.seed}:${tile.id}:${anchor.x}:${anchor.y}:${left.footprintKey}`,
    );
    const rightRank = hashStringToUint32(
      `mosaic-lab-packer:${state.seed}:${tile.id}:${anchor.x}:${anchor.y}:${right.footprintKey}`,
    );
    return leftRank - rightRank;
  });
}

function buildPackedTile(
  tile: MosaicLabSyntheticSourceTileRecord,
  sourceIndex: number,
  gridRect: MosaicLabPackedTile['gridRect'],
  footprintKey: MosaicLabFootprintKey,
  cellSize: number,
): MosaicLabPackedTile {
  const footprint = MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY[footprintKey];
  const rect = createPackedTileRect({
    tileId: tile.id,
    x: gridRect.x * cellSize,
    y: gridRect.y * cellSize,
    width: gridRect.columns * cellSize,
    height: gridRect.rows * cellSize,
    footprintKey,
    categoryFamily: footprint.categoryFamily,
  });

  return Object.freeze({
    ...rect,
    sourceTile: tile,
    sourceIndex,
    footprint,
    gridRect: Object.freeze({ ...gridRect }),
  });
}

function buildTileChoiceSignature(tile: MosaicLabSyntheticSourceTileRecord): string {
  return [
    tile.sourceArchetypeKey,
    tile.sourceOrientation,
    tile.preferredFootprintKey,
    ...tile.eligibleFootprintKeys,
  ].join('|');
}

function createSolutionFingerprint(packedTiles: readonly MosaicLabPackedTile[]): string {
  return [...packedTiles]
    .sort((left, right) => {
      if (left.y !== right.y) {
        return left.y - right.y;
      }
      if (left.x !== right.x) {
        return left.x - right.x;
      }
      return left.tileId.localeCompare(right.tileId);
    })
    .map((tile) => `${tile.gridRect.x},${tile.gridRect.y}:${tile.gridRect.columns}x${tile.gridRect.rows}:${tile.footprintKey}`)
    .join('|');
}

function countFullSpanSeams(input: {
  contract: MosaicLabPackingContract;
  packedTiles: readonly MosaicLabPackedTile[];
}): { horizontal: number; vertical: number } {
  const horizontal = getHorizontalSeamSegments(input.packedTiles).filter(
    (segment) => Math.abs(segment.length - input.contract.frame.width) <= MOSAIC_LAB_GEOMETRY_EPSILON,
  ).length;
  const vertical = getVerticalSeamSegments(input.packedTiles).filter(
    (segment) => Math.abs(segment.length - input.contract.frame.height) <= MOSAIC_LAB_GEOMETRY_EPSILON,
  ).length;

  return { horizontal, vertical };
}

function scorePackedSolution(
  contract: MosaicLabPackingContract,
  packedTiles: readonly MosaicLabPackedTile[],
): number {
  const metrics = computeMosaicLabMetrics(contract, packedTiles);
  const footprintCounts = new Map<MosaicLabFootprintKey, number>();
  let dominantFootprintCount = 0;
  let nonStandardCount = 0;

  for (const tile of packedTiles) {
    const nextCount = (footprintCounts.get(tile.footprintKey) ?? 0) + 1;
    footprintCounts.set(tile.footprintKey, nextCount);
    dominantFootprintCount = Math.max(dominantFootprintCount, nextCount);
    if (tile.categoryFamily !== 'Standard') {
      nonStandardCount += 1;
    }
  }

  const uniqueCategoryCount = new Set(packedTiles.map((tile) => tile.categoryFamily)).size;
  const fullSpanSeams = countFullSpanSeams({ contract, packedTiles });

  return (
    footprintCounts.size * 600 +
    uniqueCategoryCount * 220 +
    nonStandardCount * 140 -
    dominantFootprintCount * 90 -
    fullSpanSeams.horizontal * 1_200 -
    fullSpanSeams.vertical * 1_200 -
    metrics.seamDiagnostics.longestHorizontalSeam * 5 -
    metrics.seamDiagnostics.longestVerticalSeam * 5 -
    packedTiles.length * 4
  );
}

function scoreBranch(
  state: SearchState,
  orderedTile: OrderedTile,
  candidate: CandidatePlacement,
  tileCandidateCount: number,
): number {
  const usedFootprints = new Set(state.placedTiles.map((tile) => tile.footprintKey));
  const usedCategories = new Set(state.placedTiles.map((tile) => tile.categoryFamily));
  const area = candidate.gridRect.columns * candidate.gridRect.rows;
  const spansFullWidth = candidate.gridRect.columns === state.grid.columns ? 1 : 0;
  const spansFullHeight = candidate.gridRect.rows === state.grid.rows ? 1 : 0;
  const categoryPriority = CATEGORY_PRIORITY[candidate.categoryFamily];
  const deterministicRank = hashStringToUint32(
    `mosaic-lab-packer-branch:${state.seed}:${orderedTile.tile.id}:${candidate.footprintKey}:${candidate.gridRect.x}:${candidate.gridRect.y}`,
  );

  return (
    categoryPriority * 2_000 +
    (usedFootprints.has(candidate.footprintKey) ? 0 : 500) +
    (usedCategories.has(candidate.categoryFamily) ? 0 : 220) +
    area * 16 -
    candidate.localSeamLength * 120 -
    spansFullWidth * 240 -
    spansFullHeight * 240 -
    tileCandidateCount * 90 -
    (orderedTile.tile.preferredFootprintKey === candidate.footprintKey ? 30 : 0) -
    deterministicRank / 2 ** 32
  );
}

function getSearchBranches(
  anchor: { x: number; y: number },
  state: SearchState,
): SearchBranch[] {
  const branches: SearchBranch[] = [];
  const seenSignatures = new Set<string>();

  for (const orderedTile of state.orderedTiles) {
    if (state.packedTileIds.has(orderedTile.tile.id)) {
      continue;
    }

    const signature = buildTileChoiceSignature(orderedTile.tile);
    if (seenSignatures.has(signature)) {
      continue;
    }
    seenSignatures.add(signature);

    const candidates = getPlacementCandidates(anchor, orderedTile.tile, state);
    if (candidates.length === 0) {
      continue;
    }

    for (const candidate of candidates) {
      branches.push({
        orderedTile,
        candidate,
        branchScore: scoreBranch(state, orderedTile, candidate, candidates.length),
      });
    }
  }

  return branches.sort((left, right) => {
    if (left.branchScore !== right.branchScore) {
      return right.branchScore - left.branchScore;
    }
    if (left.orderedTile.rank !== right.orderedTile.rank) {
      return left.orderedTile.rank - right.orderedTile.rank;
    }
    return left.candidate.footprintKey.localeCompare(right.candidate.footprintKey);
  });
}

function considerSolution(
  control: SearchControl,
  contract: MosaicLabPackingContract,
  packedTiles: readonly MosaicLabPackedTile[],
): void {
  const fingerprint = createSolutionFingerprint(packedTiles);
  const score = scorePackedSolution(contract, packedTiles);

  if (
    !control.bestSolution ||
    score > control.bestSolution.score ||
    (score === control.bestSolution.score && fingerprint < control.bestSolution.fingerprint)
  ) {
    control.bestSolution = {
      packedTiles: packedTiles.map((tile) => tile),
      score,
      fingerprint,
    };
  }
}

function search(
  state: SearchState,
  control: SearchControl,
  contract: MosaicLabPackingContract,
): void {
  if (control.nodesVisited >= MAX_SEARCH_NODES || control.exactSolutionsFound >= MAX_EXACT_SOLUTIONS) {
    control.truncated = true;
    return;
  }

  control.nodesVisited += 1;

  const anchor = findFirstEmptyCell(state.occupancy);
  if (!anchor) {
    control.exactSolutionsFound += 1;
    considerSolution(control, contract, state.placedTiles);
    return;
  }

  const branches = getSearchBranches(anchor, state);
  for (const branch of branches) {
    const packedTile = buildPackedTile(
      branch.orderedTile.tile,
      branch.orderedTile.sourceIndex,
      branch.candidate.gridRect,
      branch.candidate.footprintKey,
      state.grid.cellSize,
    );

    state.packedTileIds.add(branch.orderedTile.tile.id);
    state.placedTiles.push(packedTile);
    markPlacement(state.occupancy, branch.candidate.gridRect, branch.orderedTile.tile.id);

    search(state, control, contract);

    unmarkPlacement(state.occupancy, branch.candidate.gridRect);
    state.placedTiles.pop();
    state.packedTileIds.delete(branch.orderedTile.tile.id);

    if (control.nodesVisited >= MAX_SEARCH_NODES || control.exactSolutionsFound >= MAX_EXACT_SOLUTIONS) {
      control.truncated = true;
      return;
    }
  }
}

function buildFailedResult(input: {
  recipe: MosaicLabExpandedRecipeRecord;
  seed: string;
  contract: MosaicLabPackingContract;
  settings: Required<MosaicLabPackerSettings>;
  grid: MosaicLabPackerGrid;
  sourceTiles: readonly MosaicLabSyntheticSourceTileRecord[];
  failureReason: string;
}): MosaicLabPackerFailedResult {
  return Object.freeze({
    status: 'failed',
    recipeKey: input.recipe.key,
    seed: input.seed,
    contract: input.contract,
    settings: input.settings,
    grid: input.grid,
    sourceTiles: input.sourceTiles,
    packedTiles: [],
    unpackedTiles: input.sourceTiles,
    failureReason: input.failureReason,
  });
}

export function packMosaicLabRecipe(input: {
  recipe: MosaicLabExpandedRecipeRecord;
  seed: string;
  contract: MosaicLabPackingContract;
  settings: MosaicLabPackerSettings;
}): MosaicLabPackerResult {
  const { recipe, seed, contract } = input;
  if (!seed) {
    throw new Error('seed must be non-empty');
  }

  const settings = normalizeSettings(input.settings, recipe.sourceTiles.length);
  const grid = buildGrid(contract, settings);
  const orderedTiles = orderTiles(recipe, seed, settings.maxTileCount);
  const sourceTiles = orderedTiles.map(({ tile }) => tile);

  if (orderedTiles.length === 0) {
    return buildFailedResult({
      recipe,
      seed,
      contract,
      settings,
      grid,
      sourceTiles,
      failureReason: 'No source tiles available for packing.',
    });
  }

  const state: SearchState = {
    occupancy: createOccupancy(grid),
    orderedTiles,
    placedTiles: [],
    packedTileIds: new Set<string>(),
    seed,
    grid,
  };
  const control: SearchControl = {
    nodesVisited: 0,
    exactSolutionsFound: 0,
    bestSolution: null,
    truncated: false,
  };

  search(state, control, contract);
  if (!control.bestSolution) {
    return buildFailedResult({
      recipe,
      seed,
      contract,
      settings,
      grid,
      sourceTiles,
      failureReason: 'No exact rectilinear packing was found for the requested frame and tile pool.',
    });
  }

  const packedTileIds = new Set(control.bestSolution.packedTiles.map((tile) => tile.tileId));
  const unpackedTiles = orderedTiles
    .filter(({ tile }) => !packedTileIds.has(tile.id))
    .map(({ tile }) => tile);
  const packedTiles = [...control.bestSolution.packedTiles].sort((left, right) => {
    if (left.y !== right.y) {
      return left.y - right.y;
    }
    if (left.x !== right.x) {
      return left.x - right.x;
    }
    return left.tileId.localeCompare(right.tileId);
  });

  return Object.freeze({
    status: 'packed',
    recipeKey: recipe.key,
    seed,
    contract,
    settings,
    grid,
    sourceTiles,
    packedTiles,
    unpackedTiles,
    metrics: computeMosaicLabMetrics(contract, packedTiles),
  });
}

export function getFootprintGridSpan(
  footprintKey: MosaicLabFootprintKey,
): MosaicLabFootprintGridSpan {
  return FOOTPRINT_GRID_SPANS[footprintKey];
}
