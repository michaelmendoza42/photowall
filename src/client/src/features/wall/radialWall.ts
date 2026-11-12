// Radial wall layout.
//
// The wall sprawls outward from its center instead of growing down a
// fixed-width strip: the first photos sit in the middle and later ones
// spread out roughly equally in every direction, so panning any way shows
// new photos. Each group (album) keeps to its own part of the wall. The
// world loops: reaching an edge comes straight back on the opposite side.
//
// 1. Regions. Groups get seeds on a sunflower spiral (the first group at
//    the center, later ones further out) and a power diagram balanced so
//    each group's region has about the area its photos need.
// 2. Packing. A gapless W×H rectangle is packed with the column mosaic
//    (column boundaries shift where neighbours line up, keeping seams
//    short). Each tile is shaped by a photo from the group whose region
//    it falls in, so photos fit their tiles; columns close exactly at H
//    with best-fitting photos. H is the smallest height whose interior
//    (every tile not touching the outer edge) holds all the photos.
//    A group's featured photo is a hero tile: the photo uncropped in its
//    frame, sized to the viewport, across columns made to fit it exactly
//    at the group's seed (its region's center).
// 3. Center-out. Within each group, photos of the same shape trade tiles
//    so starred photos, then earlier ones, sit nearer the wall center. The
//    outer ring of tiles gets repeats of the group's photos.
// 4. Ragged edge. The rectangle alone already covers the looping plane,
//    so the outer ring can safely reach past the edge and overlap the
//    neighbouring copy's outer ring, each tile randomly over or under.
//    The loop line becomes a jagged tangle instead of a straight seam,
//    and only repeats ever get covered.

import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import {
  ALIGN_EPSILON_PX,
  buildPackedRows,
  computeCropPenalty,
  computeDisplayHeight,
  CROP_WEIGHT,
  DISPLAY_HEIGHT_MIN_WIDTH_RATIO,
  LEVEL_MAX_CROP,
  NEIGHBOR_DELTA_WEIGHT,
  resplitBoundary,
  RESPLIT_MAX_WIDTH_RATIO,
  RESPLIT_MIN_WIDTH_RATIO,
  SEAM_BONUS_CAP_RATIO,
  SEAM_FREE_RUN_PX,
  SEAM_LEVEL_WEIGHT,
  SKYLINE_SPREAD_WEIGHT,
  type ColumnGeometry,
  type PackedTile,
  type PackerResult,
} from './packer.js';
import { featuredTileSize } from './featuredGeometry.js';
import { stableUnitInterval } from './seeded.js';
import { stableShufflePhotos } from './shuffle.js';
import { WALL_TILE_SCALE } from './worldWidth.js';

export interface RadialWallGroup {
  key: string;
  /** In priority order: earlier photos land nearer the wall center. */
  photos: readonly PhotoQueryRecord[];
  /**
   * The group's featured photo, one of `photos`: drawn as a hero tile two
   * columns wide at the group's center.
   */
  featured?: PhotoQueryRecord;
}

export interface RadialWallLayout extends PackerResult {
  worldWidth: number;
  /** Centroid of each group's tiles, in world px. */
  groupCenters: Map<string, { x: number; y: number }>;
  /** Photos laid out as hero tiles. */
  featuredPhotoIds: ReadonlySet<string>;
}

export interface RadialWallOptions {
  groups: readonly RadialWallGroup[];
  /**
   * Width the column size is derived from (the old viewport-based world
   * width), so tiles stay the size they were.
   */
  referenceWidth: number;
  /** Virtualization band height. */
  maxRowHeight: number;
  columnWidthFactors: readonly number[];
  tileScale?: number;
  /**
   * The box (world px) a featured photo's hero tile fits inside; without
   * one, featured photos are laid out like any other.
   */
  featuredBox?: { width: number; height: number };
  /**
   * Let outer-ring tiles reach past the edge so the loop shows no straight
   * seam (default). Spaced walls turn it off: overlapping tiles would read
   * as frames hung over one another.
   */
  raggedEdge?: boolean;
}

/** Candidate columns considered for each placement. */
const CANDIDATE_COLUMNS = 4;
/** Photos searched for the best fit when closing a column at the bottom. */
const CLOSE_FIT_WINDOW = 24;
/** Bisection steps when searching for the smallest workable height. */
const HEIGHT_SEARCH_ITERATIONS = 6;
/** How far outer-ring tiles reach past the edge, as a share of their size. */
const EDGE_REACH_MIN = 0.15;
const EDGE_REACH_MAX = 0.45;
/**
 * Never reach further than this share of the opposite ring's tiles, so a
 * tile drawn under the reach still shows most of itself rather than a
 * thin sliver that reads as part of its neighbour.
 */
export const EDGE_REACH_CAP = 0.35;
const EDGE_SEED = 'radial-wall-edge';
/** Fewer columns than this leave no interior, so no ring or ragged edge. */
const MIN_RING_COLUMNS = 3;
/** Aspect (width / height) bucket edges for matching photos to tiles. */
const ASPECT_BUCKET_EDGES = [0.72, 0.9, 1.12, 1.42, 1.72];
/** Region balancing: sample grid resolution and iterations. */
const REGION_SAMPLES_PER_SIDE = 64;
const REGION_ITERATIONS = 60;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SHAPE_SHUFFLE_SEED = 'radial-wall-shapes';
/**
 * A hero lands on two columns of equal height. A difference smaller than
 * a tile is closed by stretching or trimming one column's last tile (a
 * slightly different crop) by at most this share of its height.
 */
const HERO_ADJUST_MAX_RATIO = 0.35;
/**
 * The tallest tile (as a share of its width) that closes a column exactly
 * to a hero's top; columns farther below keep packing as usual.
 */
const HERO_CLOSE_MAX_WIDTH_RATIO = 1.5;
/** How far the columns beside a hero may be scaled to center it exactly. */
const HERO_SIDE_SCALE_MIN = 0.8;
const HERO_SIDE_SCALE_MAX = 1.25;

const EMPTY_LAYOUT: RadialWallLayout = {
  rows: [],
  contentHeight: 0,
  packedPhotoCount: 0,
  worldWidth: 0,
  groupCenters: new Map(),
  featuredPhotoIds: new Set(),
};

interface Slot {
  x: number;
  y: number;
  width: number;
  height: number;
  lane: number;
  group: number;
  bucket: number;
  /** Shaped by a repeat (outer ring, or interior after photos ran out). */
  repeat: boolean;
  /** A hero tile, and the featured photo it shows. */
  hero?: PhotoQueryRecord;
}

interface Pack {
  slots: Slot[];
  /** Photos not placed because the interior filled first. */
  photosLeft: number;
  /** Heroes that couldn't be placed: this height doesn't work. */
  heroesMissing: number;
}

/** A group's featured photo, the columns its hero tile spans and its size. */
interface Hero {
  group: number;
  photo: PhotoQueryRecord;
  /** First of the columns it spans. */
  lane: number;
  span: number;
  width: number;
  height: number;
  /** Target center y in region coordinates. */
  y: number;
}

export function buildRadialWallLayout(options: RadialWallOptions): RadialWallLayout {
  const groups = options.groups.filter((group) => group.photos.length > 0);
  const photos = groups.flatMap((group) => group.photos);
  if (photos.length === 0 || options.referenceWidth <= 0) return EMPTY_LAYOUT;

  const heroSizes = groups.map((group) =>
    options.featuredBox &&
    group.featured &&
    group.photos.length > 1 &&
    group.photos.includes(group.featured)
      ? featuredTileSize(group.featured, options.featuredBox)
      : null,
  );
  const heroArea = heroSizes.reduce((sum, size) => sum + (size ? size.width * size.height : 0), 0);
  const columns = buildRadialColumns(photos, options, heroArea);
  if (columns.length === 0) return EMPTY_LAYOUT;
  const baseMeanWidth = columns.reduce((sum, column) => sum + column.width, 0) / columns.length;

  // Each hero gets columns made exactly its width, as near the middle of
  // its group's part of the wall as they fit. Seeds come from a first
  // pass of the regions; resizing columns barely moves them.
  const firstAreas = groups.map((group) => estimateArea(group.photos, baseMeanWidth));
  const firstWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const firstRegions = buildRegions(
    firstAreas,
    firstWidth,
    (firstAreas.reduce((sum, area) => sum + area, 0) + heroArea) / firstWidth,
    baseMeanWidth,
  );
  const spans: Array<{ lane: number; span: number } | null> = groups.map(() => null);
  const taken = new Set<number>();
  heroSizes.forEach((size, group) => {
    if (!size) return;
    const span = Math.max(1, Math.round(size.width / baseMeanWidth));
    if (span + 2 > columns.length) return;
    const targetX = firstRegions.seeds[group]!.x;
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let lane = 1; lane + span < columns.length; lane += 1) {
      // Keep a column between heroes so their locked edges never meet.
      let free = true;
      for (let index = lane - 1; index <= lane + span; index += 1) if (taken.has(index)) free = false;
      if (!free) continue;
      const spanWidth = columns.slice(lane, lane + span).reduce((sum, c) => sum + c.width, 0);
      const distance = Math.abs(columns[lane]!.x + spanWidth / 2 - targetX);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = lane;
      }
    }
    if (best < 0) return;
    const before = columns.reduce((sum, column) => sum + column.width, 0);
    for (let index = best; index < best + span; index += 1) {
      columns[index] = { x: 0, width: size.width / span };
      taken.add(index);
    }
    // Columns snap the hero to within half a column of its target; the
    // first hero (the wall's central album) is then centered exactly by
    // widening the columns on one side and narrowing the other side's.
    if (taken.size === span) {
      const total = columns.reduce((sum, column) => sum + column.width, 0);
      const target = (targetX / before) * total;
      const leftWidth = columns.slice(0, best).reduce((sum, column) => sum + column.width, 0);
      const rightWidth = total - leftWidth - size.width;
      const wantedLeft = target - size.width / 2;
      const leftScale = wantedLeft / leftWidth;
      const rightScale = (rightWidth - (wantedLeft - leftWidth)) / rightWidth;
      if (
        leftScale >= HERO_SIDE_SCALE_MIN &&
        leftScale <= HERO_SIDE_SCALE_MAX &&
        rightScale >= HERO_SIDE_SCALE_MIN &&
        rightScale <= HERO_SIDE_SCALE_MAX
      ) {
        columns.forEach((column, index) => {
          if (index < best) column.width *= leftScale;
          else if (index >= best + span) column.width *= rightScale;
        });
      }
    }
    let x = 0;
    for (const column of columns) {
      column.x = x;
      x += column.width;
    }
    spans[group] = { lane: best, span };
  });

  const worldWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const meanColumnWidth = worldWidth / columns.length;
  const heroPhotos = groups.map((group, index) => (spans[index] ? group.featured! : null));
  const groupAreas = groups.map((group, index) => {
    const hero = heroPhotos[index];
    const area = estimateArea(group.photos, meanColumnWidth);
    const size = heroSizes[index];
    if (!hero || !size) return area;
    return area - estimateArea([hero], meanColumnWidth) + size.width * size.height;
  });
  // Originals fill the interior, inside a one-tile outer ring of repeats.
  const ringDepth = meanColumnWidth;
  const interiorWidth = Math.max(meanColumnWidth, worldWidth - 2 * ringDepth);
  const estimatedHeight = Math.max(
    groupAreas.reduce((sum, area) => sum + area, 0) / interiorWidth + 2 * ringDepth,
    // Room for the tallest hero with a tile above and below it.
    ...heroSizes.map((size, index) => (size && spans[index] ? size.height + 3 * ringDepth : 0)),
  );
  const shapeQueues = groups.map((group, index) =>
    stableShufflePhotos(
      group.photos.filter((photo) => photo !== heroPhotos[index]),
      `${SHAPE_SHUFFLE_SEED}:${index}`,
    ),
  );

  // Regions barely change across the heights tried, so build them once
  // and stretch them vertically to each height.
  const regions = buildRegions(groupAreas, worldWidth, estimatedHeight, ringDepth);
  const heroes: Hero[] = [];
  heroPhotos.forEach((photo, group) => {
    const span = spans[group];
    const size = heroSizes[group];
    if (!photo || !span || !size) return;
    heroes.push({ group, photo, ...span, ...size, y: regions.seeds[group]!.y });
  });
  const packAt = (height: number): Pack =>
    packShapes(shapeQueues, columns, height, regions, estimatedHeight / height, heroes);
  const fits = (pack: Pack): boolean => pack.photosLeft === 0 && pack.heroesMissing === 0;

  // Smallest height whose interior holds every photo.
  let low = estimatedHeight * 0.94;
  let high = estimatedHeight * 1.06;
  let fitting = packAt(high);
  for (let attempt = 0; attempt < 12 && !fits(fitting); attempt += 1) {
    low = high;
    high *= 1.15;
    fitting = packAt(high);
  }
  if (!fits(fitting)) {
    // A hero that can't be placed at any height: lay the wall out without.
    return heroes.length > 0
      ? buildRadialWallLayout({ ...options, featuredBox: undefined })
      : EMPTY_LAYOUT;
  }
  // The estimate can also run tall: step down until a height fails.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const pack = packAt(low);
    if (!fits(pack)) break;
    high = low;
    fitting = pack;
    low *= 0.94;
  }
  for (let iteration = 0; iteration < HEIGHT_SEARCH_ITERATIONS; iteration += 1) {
    const middle = (low + high) / 2;
    const pack = packAt(middle);
    if (fits(pack)) {
      high = middle;
      fitting = pack;
    } else {
      low = middle;
    }
  }

  const contentHeight = high;
  const { slots } = fitting;
  const assigned = placeCenterOut(slots, groups, worldWidth, contentHeight);
  const reach = columns.length >= MIN_RING_COLUMNS && options.raggedEdge !== false
    ? raggedEdges(slots, worldWidth, contentHeight)
    : slots.map(() => ({ left: 0, right: 0, top: 0, bottom: 0, layer: 0 }));

  const featuredPhotoIds = new Set<string>();
  const tiles: PackedTile[] = slots.map((slot, index) => {
    const photo = assigned.photos[index]!;
    if (slot.hero) featuredPhotoIds.add(photo.id);
    const edge = reach[index]!;
    return {
      photoId: photo.id,
      x: slot.x - edge.left,
      y: slot.y - edge.top,
      width: slot.width + edge.left + edge.right,
      height: slot.height + edge.top + edge.bottom,
      sourceWidth: photo.width,
      sourceHeight: photo.height,
      lane: slot.lane,
      mosaic: 0,
      ...(assigned.duplicate[index] ? { duplicate: true } : {}),
      ...(edge.layer > 0 ? { layer: edge.layer } : {}),
    };
  });

  return {
    rows: buildPackedRows(tiles, contentHeight, options.maxRowHeight),
    contentHeight,
    packedPhotoCount: photos.length,
    worldWidth,
    groupCenters: assigned.groupCenters,
    featuredPhotoIds,
  };
}

/** Mean column width the layout starts from (before columns resize). */
export function radialMeanColumnWidth(
  options: Pick<RadialWallOptions, 'referenceWidth' | 'columnWidthFactors' | 'tileScale'>,
): number {
  const factors = options.columnWidthFactors.filter((f) => Number.isFinite(f) && f > 0);
  const count = factors.length > 0 ? factors.length : 1;
  return (options.referenceWidth * (options.tileScale ?? WALL_TILE_SCALE)) / count;
}

/** Group photos by folder, in order of first appearance. */
export function groupPhotosByDirectory(
  photos: readonly PhotoQueryRecord[],
): RadialWallGroup[] {
  const groups = new Map<string, PhotoQueryRecord[]>();
  for (const photo of photos) {
    const list = groups.get(photo.directoryPath);
    if (list) list.push(photo);
    else groups.set(photo.directoryPath, [photo]);
  }
  return [...groups].map(([key, list]) => ({ key, photos: list }));
}

/** Columns at the usual tile size, enough to make the world about square. */
function buildRadialColumns(
  photos: readonly PhotoQueryRecord[],
  options: RadialWallOptions,
  /** Extra area hero tiles need beyond their photo's usual tile. */
  heroArea = 0,
): ColumnGeometry[] {
  const factors = options.columnWidthFactors.filter((f) => Number.isFinite(f) && f > 0);
  const pattern = factors.length > 0 ? factors : [1];
  const factorSum = pattern.reduce((sum, factor) => sum + factor, 0);
  const tileScale = options.tileScale ?? WALL_TILE_SCALE;
  const baseWidth = (options.referenceWidth / factorSum) * tileScale;
  if (!(baseWidth > 0)) return [];

  const meanWidth = baseWidth * (factorSum / pattern.length);
  const side = Math.sqrt(estimateArea(photos, meanWidth) + heroArea);
  // A hero needs its own columns plus one either side.
  const heroColumns = heroArea > 0 ? Math.ceil(Math.sqrt(heroArea) / meanWidth) + 3 : 0;
  const count = Math.max(
    1,
    heroColumns,
    Math.min(photos.length, Math.round(side / meanWidth)),
  );

  const columns: ColumnGeometry[] = [];
  let x = 0;
  for (let index = 0; index < count; index += 1) {
    const width = baseWidth * pattern[index % pattern.length]!;
    columns.push({ x, width });
    x += width;
  }
  return columns;
}

function estimateArea(photos: readonly PhotoQueryRecord[], columnWidth: number): number {
  let area = 0;
  for (const photo of photos) area += columnWidth * computeDisplayHeight(columnWidth, photo);
  return area;
}

interface Regions {
  /** Each group's seed: the center its region grows around. */
  seeds: ReadonlyArray<{ x: number; y: number }>;
  /** The region owner at a point among groups that qualify, or -1. */
  ownerAt(x: number, y: number, allowed: (group: number) => boolean): number;
}

/**
 * Each group's part of the wall: a power diagram around sunflower seeds
 * (first group at the center), with weights tuned on a sample grid until
 * each region's share of the area matches its photos' share.
 */
function buildRegions(
  groupAreas: readonly number[],
  width: number,
  height: number,
  /** Outer ring holds repeats, so only area inside it counts as capacity. */
  ringDepth: number,
): Regions {
  const groupCount = groupAreas.length;
  const centerX = width / 2;
  const centerY = height / 2;
  const totalArea = groupAreas.reduce((sum, area) => sum + area, 0);
  const radius = Math.min(width, height) / 2;

  let before = 0;
  const seeds = groupAreas.map((area, index) => {
    const share = (before + area / 2) / totalArea;
    before += area;
    if (groupCount === 1) return { x: centerX, y: centerY };
    const r = radius * Math.sqrt(share);
    const angle = index * GOLDEN_ANGLE;
    return { x: centerX + r * Math.cos(angle), y: centerY + r * Math.sin(angle) };
  });
  const weights = new Array<number>(groupCount).fill(0);
  const cost = (x: number, y: number, group: number): number =>
    (x - seeds[group]!.x) ** 2 + (y - seeds[group]!.y) ** 2 - weights[group]!;

  if (groupCount > 1) {
    const samples: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < REGION_SAMPLES_PER_SIDE; i += 1) {
      for (let j = 0; j < REGION_SAMPLES_PER_SIDE; j += 1) {
        const x = ((i + 0.5) / REGION_SAMPLES_PER_SIDE) * width;
        const y = ((j + 0.5) / REGION_SAMPLES_PER_SIDE) * height;
        const inRing =
          x < ringDepth || x > width - ringDepth || y < ringDepth || y > height - ringDepth;
        if (!inRing) samples.push({ x, y });
      }
    }
    const targets = groupAreas.map((area) => (area / totalArea) * samples.length);
    let step = (width * height) / groupCount;
    for (let iteration = 0; iteration < REGION_ITERATIONS; iteration += 1) {
      const counts = new Array<number>(groupCount).fill(0);
      for (const sample of samples) {
        let owner = 0;
        let ownerCost = Number.POSITIVE_INFINITY;
        for (let group = 0; group < groupCount; group += 1) {
          const c = cost(sample.x, sample.y, group);
          if (c < ownerCost) {
            ownerCost = c;
            owner = group;
          }
        }
        counts[owner]! += 1;
      }
      for (let group = 0; group < groupCount; group += 1) {
        const target = Math.max(1, targets[group]!);
        weights[group]! += (step * (target - counts[group]!)) / target;
      }
      step *= 0.95;
    }
  }

  return {
    seeds,
    ownerAt(x, y, allowed) {
      let owner = -1;
      let ownerCost = Number.POSITIVE_INFINITY;
      for (let group = 0; group < groupCount; group += 1) {
        if (!allowed(group)) continue;
        const c = cost(x, y, group);
        if (c < ownerCost) {
          ownerCost = c;
          owner = group;
        }
      }
      return owner;
    },
  };
}

/**
 * Pack a W×H rectangle. Normal placements follow the shortest-column
 * mosaic with a photo from the region's group; a column whose remaining
 * gap is about one tile closes with the best-fitting photo. Outer-ring
 * tiles (first in a column, in the outermost columns, or closing a column)
 * are shaped by repeats of the region's group, so every original photo
 * lands in the interior; originals a full region can't take spill into
 * the nearest group's region.
 */
function packShapes(
  shapeQueues: readonly (readonly PhotoQueryRecord[])[],
  initialColumns: readonly ColumnGeometry[],
  height: number,
  regions: Regions,
  /** Maps this pack's y onto the regions' y. */
  regionScaleY: number,
  heroes: readonly Hero[] = [],
): Pack {
  const queues = shapeQueues.map((queue) => queue.slice());
  const heads = queues.map(() => 0);
  const repeatCursors = queues.map(() => 0);
  let photosLeft = queues.reduce((sum, queue) => sum + queue.length, 0);
  const columns = initialColumns.map((column) => ({ ...column }));
  const minWidth =
    Math.min(...initialColumns.map((column) => column.width)) * RESPLIT_MIN_WIDTH_RATIO;
  const maxWidth =
    Math.max(...initialColumns.map((column) => column.width)) * RESPLIT_MAX_WIDTH_RATIO;
  const tops = new Array<number>(columns.length).fill(0);
  const seamStarts = new Array<number>(Math.max(0, columns.length - 1)).fill(0);
  const slots: Slot[] = [];
  /** Index in `slots` of each column's bottom tile. */
  const lastSlot = new Array<number>(columns.length).fill(-1);
  const pendingHeroes = heroes.slice();
  let heroesMissing = 0;
  /**
   * Boundaries a waiting hero's columns end at: they stay put, so the
   * columns keep exactly the hero's width until it is placed.
   */
  const locked = new Set<number>();
  for (const hero of heroes) {
    locked.add(hero.lane - 1);
    locked.add(hero.lane + hero.span - 1);
  }
  let open = columns.length;
  const lastLane = columns.length - 1;
  const isOpen = (index: number): boolean => tops[index]! < height - ALIGN_EPSILON_PX;
  const hasOriginals = (group: number): boolean => heads[group]! < queues[group]!.length;
  // A group whose only photo is its hero has nothing to repeat.
  const anyGroup = (group: number) => queues[group]!.length > 0;
  // Walls too narrow for an interior have no ring: every tile is an original.
  const hasRing = columns.length >= MIN_RING_COLUMNS;
  const inRing = (lane: number): boolean =>
    hasRing && (lane === 0 || lane === lastLane || tops[lane]! <= ALIGN_EPSILON_PX);

  /** Who shapes a tile at a point, and whether with a repeat. */
  const sourceAt = (lane: number, x: number, y: number, closing: boolean) => {
    const regionY = y * regionScaleY;
    if ((!hasRing || (!closing && !inRing(lane))) && photosLeft > 0) {
      return { group: regions.ownerAt(x, regionY, hasOriginals), repeat: false };
    }
    return { group: regions.ownerAt(x, regionY, anyGroup), repeat: true };
  };

  const peek = (group: number, repeat: boolean): PhotoQueryRecord => {
    const queue = queues[group]!;
    return repeat
      ? queue[repeatCursors[group]! % queue.length]!
      : queue[heads[group]!]!;
  };

  const take = (group: number, repeat: boolean, width: number, gap: number | null): PhotoQueryRecord => {
    const queue = queues[group]!;
    if (repeat) {
      let pick = repeatCursors[group]! % queue.length;
      if (gap !== null) {
        let bestCrop = Number.POSITIVE_INFINITY;
        for (let offset = 0; offset < Math.min(CLOSE_FIT_WINDOW, queue.length); offset += 1) {
          const index = (repeatCursors[group]! + offset) % queue.length;
          const crop = computeCropPenalty(width, queue[index]!, gap);
          if (crop < bestCrop) {
            bestCrop = crop;
            pick = index;
          }
        }
      }
      repeatCursors[group] = repeatCursors[group]! + 1;
      return queue[pick]!;
    }
    const head = heads[group]!;
    let pick = head;
    if (gap !== null) {
      let bestCrop = Number.POSITIVE_INFINITY;
      const end = Math.min(queue.length, head + CLOSE_FIT_WINDOW);
      for (let index = head; index < end; index += 1) {
        const crop = computeCropPenalty(width, queue[index]!, gap);
        if (crop < bestCrop) {
          bestCrop = crop;
          pick = index;
        }
      }
    }
    const photo = queue[pick]!;
    queue[pick] = queue[head]!;
    heads[group] = head + 1;
    photosLeft -= 1;
    return photo;
  };

  const place = (
    lane: number,
    source: { group: number; repeat: boolean },
    photo: PhotoQueryRecord,
    bottom: number,
  ): void => {
    const column = columns[lane]!;
    slots.push({
      x: column.x,
      y: tops[lane]!,
      width: column.width,
      height: bottom - tops[lane]!,
      lane,
      group: source.group,
      bucket: aspectBucket(photo),
      repeat: source.repeat,
    });
    lastSlot[lane] = slots.length - 1;
    tops[lane] = bottom;
    if (!isOpen(lane)) open -= 1;
    resplitAround(lane, lane);
  };

  /** The bottom tile of a column, if it still spans the column's current width. */
  const bottomSlot = (index: number): Slot | null => {
    const slot = slots[lastSlot[index]!];
    const column = columns[index]!;
    return slot !== undefined &&
      Math.abs(slot.x - column.x) <= ALIGN_EPSILON_PX &&
      Math.abs(slot.width - column.width) <= ALIGN_EPSILON_PX
      ? slot
      : null;
  };

  /** Shift lined-up boundaries next to lanes `first`..`last`, breaking the seam. */
  const resplitAround = (first: number, last: number): void => {
    for (let boundary = first - 1; boundary <= last; boundary += 1) {
      if (boundary < 0 || boundary >= columns.length - 1 || locked.has(boundary)) continue;
      const left = tops[boundary]!;
      const right = tops[boundary + 1]!;
      if (Math.abs(left - right) > ALIGN_EPSILON_PX) continue;
      const level = Math.max(left, right);
      if (level >= height - ALIGN_EPSILON_PX) continue;
      // Tiles below a moved boundary start at one level, so the two
      // columns must end exactly level: stretch the shorter one's bottom
      // tile by the sub-pixel difference, or leave the boundary be.
      if (left !== right) {
        const lower = left < right ? boundary : boundary + 1;
        const slot = bottomSlot(lower);
        if (!slot) continue;
        slot.height += level - tops[lower]!;
        tops[lower] = level;
      }
      if (resplitBoundary(columns, boundary, minWidth, maxWidth)) seamStarts[boundary] = level;
    }
  };

  /**
   * Try to place a hero across its columns once the tallest of them
   * reaches about its target top. Returns 'placed', 'progress' (a tile
   * went in to even the columns up), 'wait' (try again after more packing)
   * or 'skip' (it can't be placed in a wall this tall).
   */
  const heroLanes = (hero: Hero): number[] =>
    Array.from({ length: hero.span }, (_, index) => hero.lane + index);
  /**
   * Where a hero's top goes: its target, or lower when one of its columns
   * already reached past that.
   */
  const heroGoal = (hero: Hero): number =>
    Math.max(
      hero.y / regionScaleY - hero.height / 2,
      ...heroLanes(hero).map((lane) => tops[lane]!),
    );
  /** The tallest tile that can close a gap in a column exactly. */
  const closableGap = (lane: number): number =>
    columns[lane]!.width * HERO_CLOSE_MAX_WIDTH_RATIO;

  /**
   * Try to place a hero across its columns. Each column within a tile of
   * the hero's top is closed exactly to it with a tile cut to fit, while
   * farther ones keep packing as usual. Returns 'placed', 'progress' (a
   * tile went in), 'wait' (try again after more packing) or 'skip' (it
   * can't be placed in a wall this tall).
   */
  const tryHero = (hero: Hero): 'placed' | 'progress' | 'wait' | 'skip' => {
    const lanes = heroLanes(hero);
    const goal = heroGoal(hero);
    const targetTop = hero.y / regionScaleY - hero.height / 2;
    const minTile =
      Math.max(...lanes.map((lane) => columns[lane]!.width)) * DISPLAY_HEIGHT_MIN_WIDTH_RATIO;
    // Below the hero there must be room for at least one more tile, so it
    // never touches the outer ring.
    if (goal + hero.height > height - minTile || goal > targetTop + hero.height) return 'skip';
    const stretches: Array<{ slot: Slot; lane: number }> = [];
    let waiting = false;
    for (const lane of lanes) {
      const gap = goal - tops[lane]!;
      if (gap <= ALIGN_EPSILON_PX) continue;
      const column = columns[lane]!;
      const smallest = column.width * DISPLAY_HEIGHT_MIN_WIDTH_RATIO;
      if (gap > closableGap(lane)) {
        waiting = true;
        continue;
      }
      if (gap < smallest) {
        const slot = bottomSlot(lane);
        if (slot && gap / slot.height <= HERO_ADJUST_MAX_RATIO) {
          stretches.push({ slot, lane });
          continue;
        }
      }
      const source = sourceAt(lane, column.x + column.width / 2, tops[lane]! + gap / 2, false);
      if (source.group < 0) return 'wait';
      if (gap >= smallest) {
        // A tile cut to close the gap exactly.
        place(lane, source, take(source.group, source.repeat, column.width, gap), goal);
      } else {
        // Too small to close: the smallest tile there is, which moves the
        // hero's top down that little; the other columns close to it.
        place(lane, source, take(source.group, source.repeat, column.width, smallest), tops[lane]! + smallest);
      }
      return 'progress';
    }
    if (waiting) return 'wait';
    for (const { slot, lane } of stretches) {
      slot.height += goal - tops[lane]!;
      tops[lane] = goal;
    }
    const first = columns[hero.lane]!;
    slots.push({
      x: first.x,
      y: goal,
      width: lanes.reduce((sum, lane) => sum + columns[lane]!.width, 0),
      height: hero.height,
      lane: hero.lane,
      group: hero.group,
      bucket: -1,
      repeat: false,
      hero: hero.photo,
    });
    for (const lane of lanes) {
      lastSlot[lane] = -1;
      tops[lane] = goal + hero.height;
    }
    locked.delete(hero.lane - 1);
    locked.delete(hero.lane + hero.span - 1);
    resplitAround(hero.lane, hero.lane + hero.span - 1);
    return 'placed';
  };

  while (open > 0) {
    let heroPlaced = false;
    for (let index = 0; index < pendingHeroes.length; index += 1) {
      const hero = pendingHeroes[index]!;
      const outcome = tryHero(hero);
      if (outcome === 'wait') continue;
      if (outcome === 'placed' || outcome === 'skip') pendingHeroes.splice(index, 1);
      if (outcome === 'skip') {
        locked.delete(hero.lane - 1);
        locked.delete(hero.lane + hero.span - 1);
        heroesMissing += 1;
      }
      heroPlaced = true;
      break;
    }
    if (heroPlaced) continue;
    const sources = new Map<number, { group: number; repeat: boolean }>();
    // A waiting hero's columns stop once they reach its ready height, so
    // ordinary tiles don't stack past where it belongs.
    const parked = new Set<number>();
    for (const hero of pendingHeroes) {
      const goal = heroGoal(hero);
      for (const lane of heroLanes(hero)) {
        if (tops[lane]! >= goal - closableGap(lane)) parked.add(lane);
      }
    }
    const packable = (index: number): boolean => isOpen(index) && !parked.has(index);
    let anyPackable = false;
    for (let index = 0; index < columns.length && !anyPackable; index += 1) anyPackable = packable(index);
    const choice = chooseColumn(columns, tops, seamStarts, height, anyPackable ? packable : isOpen, (lane) => {
      const column = columns[lane]!;
      const source = sourceAt(lane, column.x + column.width / 2, tops[lane]! + column.width / 2, false);
      sources.set(lane, source);
      return { group: source.group, photo: peek(source.group, source.repeat) };
    });
    const column = columns[choice.lane]!;
    const minTile = column.width * DISPLAY_HEIGHT_MIN_WIDTH_RATIO;
    if (choice.bottom > height - minTile) {
      const top = tops[choice.lane]!;
      const gap = height - top;
      const source = sourceAt(choice.lane, column.x + column.width / 2, top + gap / 2, true);
      place(choice.lane, source, take(source.group, true, column.width, gap), height);
      continue;
    }
    const source = sources.get(choice.lane)!;
    place(choice.lane, source, take(source.group, source.repeat, column.width, null), choice.bottom);
  }

  return { slots, photosLeft, heroesMissing: heroesMissing + pendingHeroes.length };
}

function chooseColumn(
  columns: readonly ColumnGeometry[],
  tops: readonly number[],
  seamStarts: readonly number[],
  height: number,
  isOpen: (index: number) => boolean,
  photoFor: (lane: number) => { group: number; photo: PhotoQueryRecord },
): { lane: number; group: number; bottom: number } {
  // The few lowest open columns, by linear scan (worlds can have 100+).
  const candidates: number[] = [];
  for (let index = 0; index < columns.length; index += 1) {
    if (!isOpen(index)) continue;
    let position = candidates.length;
    while (position > 0 && tops[candidates[position - 1]!]! > tops[index]!) position -= 1;
    if (position >= CANDIDATE_COLUMNS) continue;
    candidates.splice(position, 0, index);
    if (candidates.length > CANDIDATE_COLUMNS) candidates.pop();
  }
  const lowest = tops[candidates[0]!]!;

  let best = { lane: candidates[0]!, group: 0, bottom: 0 };
  let bestScore = Number.POSITIVE_INFINITY;
  const consider = (lane: number, group: number, bottom: number, crop: number, bonus: number): void => {
    let neighborDelta = 0;
    if (lane > 0) neighborDelta += Math.abs(bottom - tops[lane - 1]!);
    if (lane < columns.length - 1) neighborDelta += Math.abs(bottom - tops[lane + 1]!);
    const score =
      (bottom - lowest) * SKYLINE_SPREAD_WEIGHT +
      neighborDelta * NEIGHBOR_DELTA_WEIGHT +
      crop * CROP_WEIGHT -
      bonus;
    if (score < bestScore) {
      bestScore = score;
      best = { lane, group, bottom };
    }
  };

  for (const lane of candidates) {
    const width = columns[lane]!.width;
    const top = tops[lane]!;
    const { group, photo } = photoFor(lane);
    consider(lane, group, top + computeDisplayHeight(width, photo), 0, 0);

    for (const neighbor of [lane - 1, lane + 1]) {
      if (neighbor < 0 || neighbor >= columns.length) continue;
      const target = tops[neighbor]!;
      if (target - top <= ALIGN_EPSILON_PX || target > height) continue;
      // Lining up just short of the bottom would leave a sliver to close.
      const sliver = width * DISPLAY_HEIGHT_MIN_WIDTH_RATIO;
      if (target < height - ALIGN_EPSILON_PX && target > height - sliver) continue;
      const crop = computeCropPenalty(width, photo, target - top);
      if (crop > LEVEL_MAX_CROP) continue;
      const boundary = Math.min(lane, neighbor);
      const reference = columns[boundary]!.width;
      const run = Math.min(top, target) - seamStarts[boundary]!;
      const excess = run - reference * SEAM_FREE_RUN_PX;
      const bonus =
        SEAM_LEVEL_WEIGHT * Math.min(Math.max(excess, 0), reference * SEAM_BONUS_CAP_RATIO);
      consider(lane, group, target, crop, bonus);
    }
  }
  return best;
}

/** Starred photos first; otherwise the order is kept. */
function starredFirst(photos: readonly PhotoQueryRecord[]): PhotoQueryRecord[] {
  return [...photos.filter((photo) => photo.starred), ...photos.filter((photo) => !photo.starred)];
}

function aspectBucket(photo: Pick<PhotoQueryRecord, 'width' | 'height' | 'aspectRatio'>): number {
  const aspect =
    Number.isFinite(photo.aspectRatio) && photo.aspectRatio > 0
      ? photo.aspectRatio
      : photo.height > 0
        ? photo.width / photo.height
        : 1;
  let bucket = 0;
  while (bucket < ASPECT_BUCKET_EDGES.length && aspect >= ASPECT_BUCKET_EDGES[bucket]!) {
    bucket += 1;
  }
  return bucket;
}

/**
 * Within each group, photos of the same shape trade tiles so starred
 * photos, then earlier ones, sit nearer the wall center. Each group shaped its interior tiles
 * with its own photos, so those counts match exactly; tiles shaped by
 * repeats (the outer ring) show the group's center-most photos again.
 */
function placeCenterOut(
  slots: readonly Slot[],
  groups: readonly RadialWallGroup[],
  worldWidth: number,
  worldHeight: number,
): {
  photos: PhotoQueryRecord[];
  duplicate: boolean[];
  groupCenters: Map<string, { x: number; y: number }>;
} {
  const bucketCount = ASPECT_BUCKET_EDGES.length + 1;
  const centerX = worldWidth / 2;
  const centerY = worldHeight / 2;
  const originalSlots: number[][][] = groups.map(() =>
    Array.from({ length: bucketCount }, () => []),
  );
  const repeatSlots: number[][][] = groups.map(() =>
    Array.from({ length: bucketCount }, () => []),
  );
  slots.forEach((slot, index) => {
    if (slot.hero) return;
    (slot.repeat ? repeatSlots : originalSlots)[slot.group]![slot.bucket]!.push(index);
  });
  const distance = (index: number): number => {
    const slot = slots[index]!;
    return (
      (slot.x + slot.width / 2 - centerX) ** 2 + (slot.y + slot.height / 2 - centerY) ** 2
    );
  };
  const byDistance = (a: number, b: number) => distance(a) - distance(b) || a - b;

  const photos = new Array<PhotoQueryRecord>(slots.length);
  const duplicate = new Array<boolean>(slots.length).fill(false);
  const groupCenters = new Map<string, { x: number; y: number }>();
  const heroSlots = new Map<number, number>();
  slots.forEach((slot, index) => {
    if (!slot.hero) return;
    photos[index] = slot.hero;
    heroSlots.set(slot.group, index);
  });
  groups.forEach((group, groupIndex) => {
    const heroIndex = heroSlots.get(groupIndex);
    const hero = heroIndex === undefined ? undefined : slots[heroIndex]!.hero;
    // The hero shows its photo; the other tiles share out the rest.
    const rest = hero ? group.photos.filter((photo) => photo !== hero) : group.photos;
    const byBucket: PhotoQueryRecord[][] = Array.from({ length: bucketCount }, () => []);
    for (const photo of starredFirst(rest)) byBucket[aspectBucket(photo)]!.push(photo);
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    if (heroIndex !== undefined) {
      const slot = slots[heroIndex]!;
      sumX += slot.x + slot.width / 2;
      sumY += slot.y + slot.height / 2;
      count += 1;
    }
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const own = byBucket[bucket]!;
      const originals = originalSlots[groupIndex]![bucket]!.sort(byDistance);
      originals.forEach((slotIndex, position) => {
        const slot = slots[slotIndex]!;
        photos[slotIndex] = own[position]!;
        sumX += slot.x + slot.width / 2;
        sumY += slot.y + slot.height / 2;
        count += 1;
      });
      const pool = own.length > 0 ? own : rest.length > 0 ? rest : group.photos;
      repeatSlots[groupIndex]![bucket]!.forEach((slotIndex, position) => {
        photos[slotIndex] = pool[position % pool.length]!;
        duplicate[slotIndex] = true;
      });
    }
    if (count > 0) groupCenters.set(group.key, { x: sumX / count, y: sumY / count });
  });
  return { photos, duplicate, groupCenters };
}

interface EdgeReach {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** 0 for interior tiles; outer-ring tiles randomly 1 or 2. */
  layer: number;
}

/**
 * How far each outer-ring tile reaches past the edge it touches: a random
 * share of its size, capped so it only ever overlaps the opposite ring
 * (which the loop puts beside it), never the interior behind that.
 */
function raggedEdges(slots: readonly Slot[], width: number, height: number): EdgeReach[] {
  const near = (a: number, b: number) => Math.abs(a - b) <= ALIGN_EPSILON_PX;
  const leftRing = slots.filter((slot) => near(slot.x, 0));
  const rightRing = slots.filter((slot) => near(slot.x + slot.width, width));
  const topRing = slots.filter((slot) => near(slot.y, 0));
  const bottomRing = slots.filter((slot) => near(slot.y + slot.height, height));
  const overlapsY = (a: Slot, b: Slot) => a.y < b.y + b.height && b.y < a.y + a.height;
  const overlapsX = (a: Slot, b: Slot) => a.x < b.x + b.width && b.x < a.x + a.width;
  const capAcross = (slot: Slot, opposite: readonly Slot[], size: (s: Slot) => number,
    overlaps: (a: Slot, b: Slot) => boolean): number => {
    let smallest = Number.POSITIVE_INFINITY;
    for (const other of opposite) if (overlaps(slot, other)) smallest = Math.min(smallest, size(other));
    return Number.isFinite(smallest) ? smallest * EDGE_REACH_CAP : 0;
  };
  const amount = (index: number, side: string, size: number): number =>
    size *
    (EDGE_REACH_MIN +
      (EDGE_REACH_MAX - EDGE_REACH_MIN) * stableUnitInterval(EDGE_SEED, `${index}:${side}`));

  return slots.map((slot, index) => {
    const reach: EdgeReach = { left: 0, right: 0, top: 0, bottom: 0, layer: 0 };
    if (near(slot.x, 0)) {
      reach.left = Math.min(amount(index, 'l', slot.width),
        capAcross(slot, rightRing, (s) => s.width, overlapsY));
    }
    if (near(slot.x + slot.width, width)) {
      reach.right = Math.min(amount(index, 'r', slot.width),
        capAcross(slot, leftRing, (s) => s.width, overlapsY));
    }
    if (near(slot.y, 0)) {
      reach.top = Math.min(amount(index, 't', slot.height),
        capAcross(slot, bottomRing, (s) => s.height, overlapsX));
    }
    if (near(slot.y + slot.height, height)) {
      reach.bottom = Math.min(amount(index, 'b', slot.height),
        capAcross(slot, topRing, (s) => s.height, overlapsX));
    }
    if (reach.left || reach.right || reach.top || reach.bottom) {
      reach.layer = stableUnitInterval(EDGE_SEED, `${index}:layer`) < 0.5 ? 1 : 2;
    }
    return reach;
  });
}
