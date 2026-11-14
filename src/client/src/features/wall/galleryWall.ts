// Layout for framed walls: a gallery wall packed on a fine grid.
//
// A framed photo's mat can take up any difference between the photo and
// its frame, so frames needn't match photos exactly. That frees the layout
// to be designed against seams first: frames take whole cells of a grid a
// quarter of a column wide, fill the wall skyline-fashion (always on its
// lowest stretch), and each placement shifts or picks its width to stagger
// its edges against the frames above, so no gap between frames runs
// straight for long. Where every choice would continue a seam, the frames
// above are stretched (more mat) to line up with a neighbour, so the next
// frame lands across the line and ends it.
//
// Around that, it keeps the radial wall's arrangement: each album's part
// of the wall grows around a seed, the featured photo hangs at its seed,
// photos of the same shape trade places so favorites sit nearer the
// center, and the bottom edge is flat so the wall loops along a straight
// gap.

import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { featuredTileSize } from './featuredGeometry.js';
import { buildPackedRows, type PackedTile } from './packer.js';
import {
  aspectBucket,
  buildRegions,
  placeCenterOut,
  SPAN_BUCKET_OFFSET,
  type RadialWallGroup,
  type RadialWallLayout,
  type Slot,
} from './radialWall.js';
import { stableShufflePhotos } from './shuffle.js';
import { framedCellAspect } from './wallSpacing.js';

export interface GalleryWallOptions {
  /** Each album's photos, in priority order, with its featured photo. */
  groups: readonly RadialWallGroup[];
  /** Photos that hang larger (favorites, very wide photos), by id. */
  large: ReadonlySet<string>;
  /** The usual column width: ordinary frames are about this wide. */
  columnWidth: number;
  /** Space between frames; every frame is drawn half a gap in from its cell. */
  gap: number;
  /** Virtualization band height. */
  maxRowHeight: number;
  /** The box a featured photo's cell fits inside; without one, none is featured. */
  heroBox?: { width: number; height: number };
  /** The tallest a cell of a given width may be (the cap set by the featured photo). */
  maxTileHeight?: (width: number) => number;
}

/** Grid cells per usual column width. */
const UNITS_PER_COLUMN = 4;
/**
 * Heights step in rows a quarter of a grid cell: fine enough that frames
 * fit their photos closely (even mats), while widths keep to the coarser
 * grid that staggers edges.
 */
const ROWS_PER_UNIT = 4;
/** Widths, in grid cells, an ordinary frame may take (0.75 to 1.25 columns). */
const WIDTHS = [3, 4, 5];
/**
 * Widths a favorite takes when it doesn't hang two columns wide: the large
 * end of the ordinary sizes, so it still hangs larger than the rest.
 */
const FAVORITE_WIDTHS = [6, 5];
/** Widths a larger frame tries first: about two columns. */
const LARGE_WIDTHS = [8, 7];
/** No frame shorter than this many rows (two grid cells). */
const MIN_HEIGHT = 2 * ROWS_PER_UNIT;
/**
 * Right around a featured photo, smaller frames fill the odd strip and
 * short space its edges leave, so no bare wall shows beside it: frames as
 * narrow as one grid cell and as short as one.
 */
const NEAR_HERO_WIDTHS = [2, 1];
const NEAR_HERO_MIN_HEIGHT = ROWS_PER_UNIT;
/** How close (grid cells) to a featured photo counts as around it. */
const NEAR_HERO_REACH = 3;
/** How far above it smaller frames may still fill in where nothing else fits. */
const NEAR_HERO_FALLBACK_ABOVE = 8;
/** Photos searched, around a featured photo, for one whose shape suits the space left. */
const FILL_LOOKAHEAD = 30;
/**
 * A gap between frames may run straight this many usual column widths,
 * or half that past a taller frame's own height.
 */
const SEAM_LIMIT_COLUMNS = 1.2;
const SEAM_LIMIT = SEAM_LIMIT_COLUMNS * UNITS_PER_COLUMN * ROWS_PER_UNIT;
/** How far a frame may end short of its photo's height to line up with a neighbour (the photo shrinks). */
const LEVEL_MAX_SHRINK = 0.15;
/** How far past it (its mat grows). */
const LEVEL_MAX_GROW = 0.35;
/**
 * Right above a featured photo a frame may end further from its photo's
 * height to meet the featured photo's top, so no bare wall is left there.
 */
const UNDER_HERO_MAX_SHRINK = 0.35;
const UNDER_HERO_MAX_GROW = 0.6;
/** Frames ending level may line up across this many usual column widths. */
const LEVEL_LINE_LIMIT_COLUMNS = 2.5;
/** Larger photos considered alongside the ordinary lookahead, when one is due. */
const LARGE_LOOKAHEAD = 2;
/** How much a frame may be stretched (share of its height) to end a seam below it. */
const MAX_LEVEL_STRETCH = 0.35;
/** Photos looked ahead through for the best placement. */
const LOOKAHEAD = 6;
/** Grid cells between a featured photo and the wall's edge, at least. */
const HERO_MARGIN = 3;
/** Wall heights tried, growing by this much each time photos don't all fit. */
const HEIGHT_GROWTH = 1.06;
const HEIGHT_ATTEMPTS = 24;
/** Halving steps between a height that fits and one that doesn't. */
const HEIGHT_SEARCH_STEPS = 6;
const SHUFFLE_SEED = 'gallery-wall';
/**
 * Past the middle zone (the featured photo and the favorites), the wall
 * grows outward in an ellipse this much wider than tall: it reaches the
 * sides early, so the last space to fill is at the top and bottom (where
 * the wall loops) rather than narrow bands down the sides, which would
 * stack into long seams.
 */
const GROWTH_WIDENING = 1;
/** The middle zone holds this much more area than its photos take. */
const MIDDLE_ZONE_SPARE = 1.15;
/** Tries at making room for a favorite two columns wide before it hangs at the usual size. */
const LARGE_PATIENCE = 6;
/** Widths (grid cells) of the blocks the edge between the two sweeps is staggered in. */
const EDGE_BLOCK_WIDTHS = [4, 3, 5];
/** How far (rows) each block sits above or below the featured photo's top edge. */
const EDGE_OFFSETS = [-2 * ROWS_PER_UNIT, ROWS_PER_UNIT, -ROWS_PER_UNIT, 2 * ROWS_PER_UNIT];

function stableIndex(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

const EMPTY: RadialWallLayout = {
  rows: [],
  contentHeight: 0,
  packedPhotoCount: 0,
  worldWidth: 0,
  groupCenters: new Map(),
  featuredPhotoIds: new Set(),
};

interface Cell {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Its photo's own framed height: stretching never takes it far past this. */
  natural: number;
  group: number;
  photo: PhotoQueryRecord;
  repeat: boolean;
  large: boolean;
}

interface HeroBlock {
  group: number;
  photo: PhotoQueryRecord;
  /** Grid cells across and rows down it takes. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The featured tile itself, in px (cell size, before the gap inset). */
  size: { width: number; height: number };
}

interface Pass {
  cells: Cell[];
  heroes: HeroBlock[];
  photosLeft: number;
}

export function buildGalleryWallLayout(options: GalleryWallOptions): RadialWallLayout {
  const groups = options.groups.filter((group) => group.photos.length > 0);
  const photos = groups.flatMap((group) => group.photos);
  if (photos.length === 0 || !(options.columnWidth > 0)) return EMPTY;
  const unit = options.columnWidth / UNITS_PER_COLUMN;
  const row = unit / ROWS_PER_UNIT;
  const { gap } = options;

  const heroPhotos = groups.map((group) =>
    options.heroBox && group.featured && group.photos.length > 1 && group.photos.includes(group.featured)
      ? group.featured
      : null,
  );
  const heroSizes = heroPhotos.map((photo) => (photo ? featuredTileSize(photo, options.heroBox!) : null));
  const heroUnits = heroSizes.map((size) =>
    size ? { width: Math.ceil(size.width / unit), height: Math.ceil(size.height / row) } : null,
  );

  /** Rows tall a photo's frame is at `width` grid cells wide. */
  const heightFor = (photo: PhotoQueryRecord, width: number): number =>
    Math.max(MIN_HEIGHT, Math.round((ROWS_PER_UNIT * width) / framedCellAspect(photo, width * unit, gap)));
  /** The most rows tall a frame `width` cells wide may be. */
  const capFor = (width: number): number =>
    options.maxTileHeight ? Math.floor(options.maxTileHeight(width * unit) / row) : Number.POSITIVE_INFINITY;

  // About square, like the radial wall, with room for each featured photo
  // (areas in grid cells).
  const areaOf = (photo: PhotoQueryRecord, group: number) =>
    (heroPhotos[group] === photo
      ? heroUnits[group]!.width * heroUnits[group]!.height
      : 4 * heightFor(photo, 4)) / ROWS_PER_UNIT;
  const groupAreas = groups.map((group, index) =>
    group.photos.reduce((sum, photo) => sum + areaOf(photo, index), 0),
  );
  const totalArea = groupAreas.reduce((sum, area) => sum + area, 0);
  const widestHero = Math.max(0, ...heroUnits.map((size) => size?.width ?? 0));
  const width = Math.max(
    Math.round(Math.sqrt(totalArea)),
    widestHero + 2 * HERO_MARGIN,
    Math.max(...WIDTHS),
  );
  const tallestHero = Math.max(0, ...heroUnits.map((size) => size?.height ?? 0));
  const startHeight = Math.max(
    Math.round((totalArea / width) * ROWS_PER_UNIT),
    tallestHero + 2 * HERO_MARGIN * ROWS_PER_UNIT,
  );
  // Regions (in grid cells both ways) barely change across the heights
  // tried: build them once and stretch them to each height.
  const regions = buildRegions(groupAreas, width, startHeight / ROWS_PER_UNIT, 0);

  // Photos hang in order, nearest the middle first: favorites lead.
  const othersOf = (index: number) => {
    const shuffled = stableShufflePhotos(
      groups[index]!.photos.filter((photo) => photo !== heroPhotos[index]),
      `${SHUFFLE_SEED}:${index}`,
    );
    return [...shuffled.filter((photo) => photo.starred), ...shuffled.filter((photo) => !photo.starred)];
  };
  // Larger photos that can hang larger under the cap; the rest (a tall
  // portrait favorite, say) hang at the usual size.
  const hangsLarge = new Set(
    photos
      .filter((photo) => options.large.has(photo.id))
      .filter((photo) => LARGE_WIDTHS.some((w) => capFor(w) >= heightFor(photo, w) * 0.75))
      .map((photo) => photo.id),
  );

  const pack = (height: number): Pass => {
    const scaleY = startHeight / height;
    const repeatPools = groups.map((_, index) => othersOf(index));
    const queues = repeatPools.map((pool) => pool.filter((photo) => !hangsLarge.has(photo.id)));
    const largeQueues = repeatPools.map((pool) => pool.filter((photo) => hangsLarge.has(photo.id)));
    const heads = queues.map(() => 0);
    const largeHeads = queues.map(() => 0);
    const repeatCursors = queues.map(() => 0);
    let photosLeft = repeatPools.reduce((sum, pool) => sum + pool.length, 0);
    // The middle zone: room for the featured photo and the favorites.
    const middleZone = Math.sqrt(
      (groups.reduce(
        (sum, group, index) =>
          sum +
          group.photos
            .filter((photo) => photo !== heroPhotos[index] && (photo.starred || hangsLarge.has(photo.id)))
            .reduce((area, photo) => {
              const w = hangsLarge.has(photo.id) ? LARGE_WIDTHS[0]! : 4;
              return area + (w * heightFor(photo, w)) / ROWS_PER_UNIT;
            }, 0) +
          (heroUnits[index] ? (heroUnits[index]!.width * heroUnits[index]!.height) / ROWS_PER_UNIT : 0),
        0,
      ) *
        MIDDLE_ZONE_SPARE) /
        Math.PI,
    );
    /** Favorites that found no room two columns wide, now hung at the usual size. */
    const demoted = new Set<string>();
    const largeMisses = groups.map(() => 0);
    /** Larger photos (favorites first) are offered first near the middle, so they hang there. */
    const largeDue = (group: number) => largeHeads[group]! < largeQueues[group]!.length;
    /** Larger photos left over once the ordinary ones run out hang like the others. */
    const releaseLarge = (group: number) => {
      const rest = largeQueues[group]!.slice(largeHeads[group]!);
      largeHeads[group] = largeQueues[group]!.length;
      queues[group]!.splice(heads[group]!, 0, ...rest);
    };
    // Featured photos at their album's seed, kept apart from each other
    // and from the edges.
    const heroes: HeroBlock[] = [];
    heroPhotos.forEach((photo, group) => {
      const size = heroUnits[group];
      if (!photo || !size) return;
      const seed = regions.seeds[group]!;
      const clamp = (value: number, room: number, extent: number, margin: number) =>
        Math.min(Math.max(value, margin), extent - room - margin);
      const x = clamp(Math.round(seed.x - size.width / 2), size.width, width, HERO_MARGIN);
      const yMargin = HERO_MARGIN * ROWS_PER_UNIT;
      const y = clamp(Math.round((seed.y * ROWS_PER_UNIT) / scaleY - size.height / 2), size.height, height, yMargin);
      if (x < HERO_MARGIN || y < yMargin) return;
      const clash = heroes.some(
        (other) =>
          x < other.x + other.width + 1 &&
          other.x < x + size.width + 1 &&
          y < other.y + other.height + 1 &&
          other.y < y + size.height + 1,
      );
      if (clash) return;
      heroes.push({ group, photo, x, y, ...size, size: heroSizes[group]! });
    });

    /**
     * One sweep of the skyline packer: from the edge `init` (a top row per
     * grid column) down to row `limit`, around `obstacles` (featured photos
     * it packs up to). `toRealTop` maps its rows onto the wall's, for the
     * album regions; `edges` are featured photos whose sides it packs beside.
     */
    const makeSweep = (
      init: readonly number[],
      limit: number,
      obstacles: HeroBlock[],
      toRealTop: (top: number) => number,
      /** The middle the wall grows out from (grid cells across, wall rows down). */
      center: { x: number; y: number },
      edges: readonly HeroBlock[] = [],
    ) => {
      const heights = init.slice();
      /** Per grid column: the cell whose bottom forms the skyline there (-1 none, -2 a hero). */
      const above = new Array<number>(width).fill(-1);
      const cells: Cell[] = [];
      /**
       * Per vertical grid line: the row where it last stopped running
       * straight, the bottom of the last frame hung across it.
       */
      const lineStart = new Array<number>(width + 1).fill(0);
      // A step in the starting edge is a line the other sweep runs along
      // too: count it as already half way to a seam, so it's crossed soon.
      for (let e = 1; e < width; e += 1) {
        lineStart[e] = Math.min(init[e - 1]!, init[e]!) - (init[e - 1] !== init[e] ? SEAM_LIMIT : 0);
      }

      /** The lowest top a frame over columns x..x+w-1 starting at `top` must stop at. */
      const ceilingFor = (x: number, w: number, top: number): number => {
        let ceiling = limit;
        for (const hero of obstacles) {
          if (hero.y > top && x < hero.x + hero.width && hero.x < x + w) ceiling = Math.min(ceiling, hero.y);
        }
        return ceiling;
      };
      /** Columns that reach a featured photo's top continue below it. */
      const absorbHeroes = (from: number, to: number) => {
        for (const hero of obstacles) {
          for (let x = Math.max(from, hero.x); x < Math.min(to, hero.x + hero.width); x += 1) {
            if (heights[x] === hero.y) {
              heights[x] = hero.y + hero.height;
              above[x] = -2;
            }
          }
        }
      };
      /** How far the gap along grid line `e` would run straight, beside a frame from `top` to `bottom`. */
      const runAlong = (e: number, top: number, bottom: number): number => {
        if (e <= 0 || e >= width) return 0;
        let start = lineStart[e]!;
        for (const hero of [...obstacles, ...edges]) {
          if (e < hero.x || e > hero.x + hero.width) continue;
          const heroBottom = hero.y + hero.height;
          // Beside a featured photo the line is its edge: nothing to do about it.
          if ((e === hero.x || e === hero.x + hero.width) && bottom > hero.y && top < heroBottom) return 0;
          // Past it, the line along its side carries on: it counts from its top.
        if (top >= heroBottom) start = Math.max(start, (e === hero.x || e === hero.x + hero.width) ? hero.y : heroBottom);
        }
        return bottom - start;
      };
      /** A frame across grid lines from..to (exclusive of its edges) ends their runs at `bottom`. */
      const crossLines = (from: number, to: number, bottom: number) => {
        for (let e = from + 1; e < to; e += 1) lineStart[e] = Math.max(lineStart[e]!, bottom);
      };
      /** A cell may grow down to `target` only if nothing hangs under it yet and it stays within the cap. */
      const canGrow = (index: number, target: number, grow = MAX_LEVEL_STRETCH): boolean => {
        const cell = cells[index]!;
        for (let x = cell.x; x < cell.x + cell.width; x += 1) {
          if (above[x] !== index || heights[x] !== cell.y + cell.height) return false;
        }
        return (
          target <= ceilingFor(cell.x, cell.width, cell.y + cell.height) &&
          target - cell.y <= capFor(cell.width) &&
          target - cell.y <= cell.natural * (1 + grow)
        );
      };
      /** Whether ending at `target` over x..x+w-1 would leave a space too short for a frame above a featured photo. */
      const strandsRow = (x: number, w: number, target: number): boolean => {
        const left = ceilingFor(x, w, target) - target;
        return left > 0 && left < NEAR_HERO_MIN_HEIGHT;
      };
      /** Stretch the frames whose bottoms form start..end down to `target` (more mat). */
      const stretchTo = (start: number, end: number, target: number): boolean => {
        const stretched = new Set<number>();
        for (let x = start; x <= end; x += 1) {
          if (above[x]! < 0) return false;
          stretched.add(above[x]!);
        }
        if (strandsRow(start, end - start + 1, target)) return false;
        for (const index of stretched) {
          const cell = cells[index]!;
          if (cell.x < start || cell.x + cell.width > end + 1 || !canGrow(index, target)) return false;
        }
        for (const index of stretched) {
          const cell = cells[index]!;
          cell.height = target - cell.y;
          crossLines(cell.x, cell.x + cell.width, target);
        }
        for (let x = start; x <= end; x += 1) heights[x] = target;
        return true;
      };
      const neighbourHeights = (start: number, end: number, top: number): number[] =>
        [start > 0 ? heights[start - 1]! : Infinity, end + 1 < width ? heights[end + 1]! : Infinity]
          .filter((h) => Number.isFinite(h) && h > top)
          .sort((a, b) => a - b);

      /** Whether a frame over x..x+w-1 leaves a too-narrow strip beside a featured photo's side. */
      const strandsStrip = (hero: HeroBlock, x: number, w: number): boolean => {
        const minWidth = Math.min(...WIDTHS);
        const leftPart = x < hero.x && hero.x < x + w ? hero.x - x : 0;
        const rightPart = x < hero.x + hero.width && hero.x + hero.width < x + w ? x + w - (hero.x + hero.width) : 0;
        return (leftPart > 0 && leftPart < minWidth) || (rightPart > 0 && rightPart < minWidth);
      };
      /** Hang a frame: it becomes the skyline under it. */
      const hang = (cell: Cell) => {
        cells.push(cell);
        for (let x = cell.x; x < cell.x + cell.width; x += 1) {
          heights[x] = cell.y + cell.height;
          above[x] = cells.length - 1;
        }
        crossLines(cell.x, cell.x + cell.width, cell.y + cell.height);
        absorbHeroes(cell.x, cell.x + cell.width);
      };
      /**
       * A window, around the stretch at `start`, where the group's next larger
       * photo can hang once the lower frames in it are stretched level with
       * the highest: the one needing least stretching, or null.
       */
      const roomForLarge = (
        group: number,
        start: number,
        top: number,
        photo = largeQueues[group]![largeHeads[group]!],
        widths: readonly number[] = LARGE_WIDTHS,
      ) => {
        if (!photo) return null;
        let best: { x: number; w: number; level: number; h: number; natural: number; cost: number } | null = null;
        for (const w of widths) {
          const natural = heightFor(photo, w);
          if (capFor(w) < natural * 0.75) continue;
          for (let x = Math.max(0, start - w + 1); x <= Math.min(start, width - w); x += 1) {
            let level = 0;
            for (let i = x; i < x + w; i += 1) level = Math.max(level, heights[i]!);
            const h = Math.min(natural, capFor(w), ceilingFor(x, w, level) - level);
            if (h < natural * 0.75 || strandsRow(x, w, level + h)) continue;
            // Nor stacked into a column with straight sides.
            const seamy = [x, x + w].some(
              (edge) => runAlong(edge, level, level + h) > Math.max(SEAM_LIMIT, h + SEAM_LIMIT / 2),
            );
            if (seamy) continue;
            // Every lower column's frame must stretch down to the level on its own.
            let cost = 0;
            let fits = true;
            const grown = new Set<number>();
            for (let i = x; i < x + w && fits; i += 1) {
              if (heights[i] === level) continue;
              const index = above[i]!;
              if (index < 0) {
                fits = false;
                break;
              }
              if (grown.has(index)) continue;
              const cell = cells[index]!;
              fits = cell.x >= x && cell.x + cell.width <= x + w && canGrow(index, level);
              grown.add(index);
              cost += level - (cell.y + cell.height);
            }
            if (fits && (!best || cost < best.cost)) best = { x, w, level, h, natural, cost };
          }
        }
        if (!best) return null;
        for (let i = best.x; i < best.x + best.w; i += 1) {
          if (heights[i] === best.level) continue;
          const cell = cells[above[i]!]!;
          if (cell.y + cell.height !== best.level) {
            cell.height = best.level - cell.y;
            crossLines(cell.x, cell.x + cell.width, best.level);
          }
          heights[i] = best.level;
        }
        return best;
      };
      const hasOriginals = (group: number) =>
        heads[group]! < queues[group]!.length || largeHeads[group]! < largeQueues[group]!.length;
      const anyPhotos = (group: number) => repeatPools[group]!.length > 0;
      /** How wide frames ending at `bottom` over x..x+w-1 would line up with the skyline beside them. */
      const levelLine = (x: number, w: number, bottom: number): number => {
        let run = w;
        for (let i = x - 1; i >= 0 && heights[i] === bottom; i -= 1) run += 1;
        for (let i = x + w; i < width && heights[i] === bottom; i += 1) run += 1;
        return run;
      };

      /**
       * The open stretch of skyline (a run of columns at one row, lower than
       * the columns either side) nearest the middle, and how far from it.
       */
      const nextStretch = () => {
        let best: { start: number; end: number; top: number; distance: number } | null = null;
        for (let x = 0; x < width; ) {
          const top = heights[x]!;
          let end = x;
          while (end + 1 < width && heights[end + 1] === top) end += 1;
          const leftHigher = x === 0 || heights[x - 1]! > top;
          const rightHigher = end === width - 1 || heights[end + 1]! > top;
          // Only a dip in the skyline (both neighbours higher): a column
          // never runs ahead of its neighbours, so frames don't stack into
          // straight-sided columns, while among the dips the nearest the
          // middle goes first.
          if (top < limit && leftHigher && rightHigher) {
            const dx = Math.max(0, x - center.x, center.x - (end + 1));
            // Evenly in every direction within the middle zone, then wider.
            const dy = (toRealTop(top) - center.y) / ROWS_PER_UNIT;
            const even = Math.hypot(dx, dy);
            const wide = Math.hypot(dx / GROWTH_WIDENING, dy);
            const distance = even <= middleZone ? even : middleZone + wide * (1 - middleZone / even);
            if (!best || distance < best.distance) best = { start: x, end, top, distance };
          }
          x = end + 1;
        }
        return best;
      };

      const step = (): boolean => {
        // The stretch of the skyline nearest the middle: the wall grows out
        // from it in every direction.
        const next = nextStretch();
        if (!next) return false;
        const { start, end, top } = next;
        const length = end - start + 1;
        const minWidth = Math.min(...WIDTHS);
        // Around a featured photo, smaller frames fill whatever space its
        // edges leave.
        const around = (above: number) =>
          obstacles.some(
            (hero) =>
              start < hero.x + hero.width + NEAR_HERO_REACH &&
              hero.x - NEAR_HERO_REACH <= end &&
              top < hero.y + hero.height &&
              top >= hero.y - above * ROWS_PER_UNIT,
          );
        const close = around(NEAR_HERO_REACH);
        const nearby = around(NEAR_HERO_FALLBACK_ABOVE);

        if (length < minWidth && !nearby) {
          // Too narrow for any frame: lower it to its shallower neighbour by
          // stretching the frames above (more mat, never a crop), or leave
          // it bare wall: a wider gap there, never an overlap.
          const target = Math.min(neighbourHeights(start, end, top)[0] ?? limit, ceilingFor(start, length, top));
          if (!stretchTo(start, end, target)) for (let x = start; x <= end; x += 1) heights[x] = target;
          absorbHeroes(start, end + 1);
          return true;
        }

        const repeat = photosLeft === 0;
        const group = regions.ownerAt(
          start + length / 2,
          (toRealTop(top) / ROWS_PER_UNIT + 0.5) * scaleY,
          repeat ? anyPhotos : hasOriginals,
        );
        if (group < 0) return false;
        if (!repeat && heads[group]! >= queues[group]!.length) releaseLarge(group);
        // Favorites hang larger only near the middle (past it they've hung
        // at the usual size already, nearer it); very wide photos anywhere.
        const nextLarge = largeQueues[group]![largeHeads[group]!];
        if (!repeat && nextLarge?.starred && next.distance > middleZone) {
          // Past the middle with favorites still waiting for room two columns
          // wide: they hang next, at the usual size, as near the middle as is left.
          const waiting = largeQueues[group]!.slice(largeHeads[group]!).filter((photo) => photo.starred);
          for (const photo of waiting) demoted.add(photo.id);
          const rest = largeQueues[group]!.slice(largeHeads[group]!).filter((photo) => !photo.starred);
          largeQueues[group]!.splice(largeHeads[group]!, largeQueues[group]!.length, ...rest);
          queues[group]!.splice(heads[group]!, 0, ...waiting);
          return true;
        }
        const due = largeDue(group) && (!nextLarge?.starred || next.distance <= middleZone);
        // A favorite next in the ordinary line (one that doesn't hang two
        // columns wide) still hangs larger than the rest: if no stretch here
        // is wide enough, even one out near the middle for it.
        const nextOrdinary = queues[group]![heads[group]!];
        if (!repeat && nextOrdinary?.starred && length < FAVORITE_WIDTHS[0]!) {
          const anchor = Math.min(Math.max(Math.round(center.x), start), end);
          const room = roomForLarge(group, anchor, top, nextOrdinary, FAVORITE_WIDTHS);
          if (room) {
            heads[group] = heads[group]! + 1;
            photosLeft -= 1;
            hang({ x: room.x, y: room.level, width: room.w, height: room.h, natural: room.natural, group, photo: nextOrdinary, repeat: false, large: false });
            return true;
          }
        }
        const queue = queues[group]!;
        // The photos this placement chooses among: the next few in line,
        // the next larger ones near the album's center, or repeats.
        const candidates: Array<{ photo: PhotoQueryRecord; offset: number; from: 'queue' | 'large' | 'repeat'; index: number }> = [];
        if (repeat) {
          const pool = repeatPools[group]!;
          for (let offset = 0; offset < Math.min(LOOKAHEAD, pool.length); offset += 1) {
            const index = (repeatCursors[group]! + offset) % pool.length;
            candidates.push({ photo: pool[index]!, offset, from: 'repeat', index });
          }
        } else {
          for (let offset = 0; offset < (nearby ? FILL_LOOKAHEAD : LOOKAHEAD) && heads[group]! + offset < queue.length; offset += 1) {
            candidates.push({ photo: queue[heads[group]! + offset]!, offset, from: 'queue', index: heads[group]! + offset });
          }
          if (due) {
            const large = largeQueues[group]!;
            for (let offset = 0; offset < LARGE_LOOKAHEAD && largeHeads[group]! + offset < large.length; offset += 1) {
              candidates.push({ photo: large[largeHeads[group]! + offset]!, offset, from: 'large', index: largeHeads[group]! + offset });
            }
          }
        }
        let best: {
          x: number;
          w: number;
          h: number;
          candidate: number;
          score: number;
          large: boolean;
          seamy: boolean;
        } | null = null;
        const leftLevel = start > 0 ? heights[start - 1]! : -1;
        const rightLevel = end + 1 < width ? heights[end + 1]! : -1;
        // Ordinary frames first, their mats within the usual limits. Around a
        // featured photo, then: a strip too narrow for an ordinary frame
        // takes a small one, and a photo whose shape suits the space is
        // searched for further down the line. Only where nothing fits does a
        // frame stretch or shrink further (bare wall would be worse).
        const modes = close ? ['near', 'loose'] : nearby ? ['strict', 'near', 'loose'] : ['strict', 'loose'];
        for (const mode of modes) {
          if (best) break;
          const near = mode !== 'strict' && nearby;
          const loose = mode === 'loose';
          const minHeight = near ? NEAR_HERO_MIN_HEIGHT : MIN_HEIGHT;
          for (let candidate = 0; candidate < candidates.length; candidate += 1) {
            const { photo, offset } = candidates[candidate]!;
            const wantsLarge = hangsLarge.has(photo.id) && !demoted.has(photo.id);
            if (mode === 'strict' && offset >= LOOKAHEAD) continue;
            const choices = [
              ...(wantsLarge ? LARGE_WIDTHS : []),
              // A favorite hangs larger than the rest: the smaller widths
              // only as a last resort.
              ...(photo.starred
                ? loose
                  ? [...FAVORITE_WIDTHS, ...WIDTHS.filter((w) => !FAVORITE_WIDTHS.includes(w))]
                  : FAVORITE_WIDTHS
                : WIDTHS),
              ...(near && length < minWidth ? NEAR_HERO_WIDTHS.filter((w) => w === length) : []),
            ];
            for (const w of choices) {
              if (w > length) continue;
              const rest = length - w;
              // Never leave a sliver too narrow for a frame beside it.
              if (rest > 0 && rest < minWidth) continue;
              const large = LARGE_WIDTHS.includes(w);
              const natural = heightFor(photo, w);
              // A larger frame that the cap would shrink much isn't larger.
              if (large && capFor(w) < natural * 0.75) continue;
              for (const x of rest > 0 ? [start, end + 1 - w] : [start]) {
                const room = ceilingFor(x, w, top) - top;
                if (room < minHeight) continue;
                // A favorite hangs larger only near the middle.
                const fromMiddle = Math.hypot(x + w / 2 - center.x, (toRealTop(top) - center.y) / ROWS_PER_UNIT);
                if (large && photo.starred && fromMiddle > middleZone) continue;
                const underHero = top + room < limit;
                // Its own height, or ending level with a taller neighbour so the
                // next frame can hang across the line between them, or meeting
                // the top of a featured photo below.
                const heightsTried = [natural];
                if (x === start && leftLevel > top) heightsTried.push(leftLevel - top);
                if (x + w === end + 1 && rightLevel > top) heightsTried.push(rightLevel - top);
                if (underHero) heightsTried.push(room);
                const shrink = underHero ? UNDER_HERO_MAX_SHRINK : LEVEL_MAX_SHRINK;
                const grow = underHero ? UNDER_HERO_MAX_GROW : LEVEL_MAX_GROW;
                for (const tried of heightsTried) {
                  // Meeting a featured photo's top is always allowed as a last
                  // resort (bare wall there is worse than a shrunk photo).
                  const meetsHero = loose && underHero && tried === room;
                  if (!meetsHero && tried !== natural && (tried < natural * (1 - shrink) || tried > natural * (1 + grow))) {
                    continue;
                  }
                  let h = Math.min(tried, capFor(w), room);
                  // Never leave a space too short for a frame above a featured
                  // photo or the wall's bottom: this frame grows its mat to fill
                  // it, or ends a frame's height short of it.
                  const left = room - h;
                  if (left > 0 && left < minHeight) {
                    if (room <= capFor(w) && ((loose && underHero) || room <= natural * (1 + grow))) h = room;
                    else if (room - minHeight >= natural * (1 - shrink)) h = room - minHeight;
                    else continue;
                  }
                  if (h < minHeight) continue;
                  // A photo squeezed far below its own height floats in mat.
                  if (!loose && h < natural * (1 - shrink)) continue;
                  // A small filler frame never stretches into a thin strip.
                  if (w < minWidth && h > 2 * w * ROWS_PER_UNIT) continue;
                  const bottom = top + h;
                  // Ending on a featured photo's top while hanging part-way past
                  // its side would leave a strip beside it too narrow for a frame.
                  if (!near && obstacles.some((hero) => hero.y === bottom && strandsStrip(hero, x, w))) continue;
                  const fit = Math.abs(h - natural) / natural;
                  // A gap running straight past the limit is the worst thing to
                  // leave, unless this frame ends level with the frame across it.
                  let seam = 0;
                  let levelled = 0;
                  for (const [edge, level] of [[x, x === start ? leftLevel : -1], [x + w, x + w === end + 1 ? rightLevel : -1]] as const) {
                    if (level === bottom) {
                      levelled += 1;
                      continue;
                    }
                    const excess = runAlong(edge, top, bottom) - Math.max(SEAM_LIMIT, h + SEAM_LIMIT / 2);
                    if (excess > 0) seam += 100 + excess * 2;
                  }
                  // Then: hang larger photos larger, fit the photo, keep photos
                  // in their order, fill the stretch, and keep sizes near usual.
                  // A level line running long across the wall is a seam too.
                  const line = levelLine(x, w, bottom) - LEVEL_LINE_LIMIT_COLUMNS * UNITS_PER_COLUMN;
                  if (line > 0) seam += 60 + line * 4;
                  const score =
                    seam -
                    levelled * 12 +
                    (wantsLarge && !large ? 40 : 0) +
                    fit * 40 +
                    offset * 6 +
                    (rest > 0 ? 2 : 0) +
                    (large ? 0 : photo.starred ? (FAVORITE_WIDTHS[0]! - w) * 12 : Math.abs(w - 4) * 1.5) +
                    // Hug the middle: of the stretch's two ends, the nearer.
                    Math.abs(x + w / 2 - center.x) * 0.5 +
                    // Small frames only where nothing else fits.
                    (w < minWidth ? 30 : 0);
                  if (!best || score < best.score) best = { x, w, h, candidate, score, large, seamy: seam > 0 };
                }
              }
            }
          }
        }
        // A larger photo is due but no stretch here is wide enough: even out a
        // nearly level stretch around this one by stretching the lower frames
        // (more mat), and hang it across.
        if (!repeat && due && !best?.large) {
          // Around the stretch's end nearest the middle.
          const anchor = Math.min(Math.max(Math.round(center.x), start), end);
          const head = largeQueues[group]![largeHeads[group]!]!;
          const room =
            roomForLarge(group, anchor, top) ??
            // No room two columns wide: a favorite still hangs larger.
            (head.starred ? roomForLarge(group, anchor, top, head, FAVORITE_WIDTHS) : null);
          if (room) {
            const photo = head;
            largeHeads[group] = largeHeads[group]! + 1;
            largeMisses[group] = 0;
            photosLeft -= 1;
            hang({
              x: room.x,
              y: room.level,
              width: room.w,
              height: room.h,
              natural: room.natural,
              group,
              photo,
              repeat: false,
              large: LARGE_WIDTHS.includes(room.w),
            });
            return true;
          }
          // No room for it two columns wide near the middle after a few
          // tries: it hangs at the usual size, still near the middle.
          largeMisses[group] = largeMisses[group]! + 1;
          if (largeMisses[group]! >= LARGE_PATIENCE) {
            const photo = largeQueues[group]![largeHeads[group]!]!;
            demoted.add(photo.id);
            largeHeads[group] = largeHeads[group]! + 1;
            queues[group]!.splice(heads[group]!, 0, photo);
            largeMisses[group] = 0;
            // The line of photos changed under this step's choice: choose again.
            return true;
          }
        }
        // Every way of filling this stretch continues a seam: instead, stretch
        // its frames down level with a neighbour, so the next frame lands
        // across the line and ends it.
        if (best && best.seamy) {
          const target = neighbourHeights(start, end, top)[0];
          if (target !== undefined && target <= ceilingFor(start, length, top) && stretchTo(start, end, target)) {
            absorbHeroes(start, end + 1);
            return true;
          }
        }
        if (!best) {
          // Right under a featured photo with no room for a frame: close the
          // little space with the frames above, or leave it bare wall.
          // Each frame above that can stretches down to it (mats a little
          // deeper right above a featured photo); the rest stays bare wall.
          const target = Math.min(ceilingFor(start, length, top), neighbourHeights(start, end, top)[0] ?? limit);
          if (!stretchTo(start, end, target)) {
            for (let x = start; x <= end; x += 1) {
              const index = above[x]!;
              const cell = index >= 0 ? cells[index]! : null;
              if (cell && cell.y + cell.height === top && cell.x >= start && cell.x + cell.width <= end + 1 && canGrow(index, target, UNDER_HERO_MAX_GROW)) {
                cell.height = target - cell.y;
                crossLines(cell.x, cell.x + cell.width, target);
              }
              heights[x] = target;
            }
          }
          absorbHeroes(start, end + 1);
          return true;
        }

        const chosen = candidates[best.candidate]!;
        const photo = chosen.photo;
        if (chosen.from === 'repeat') {
          repeatCursors[group] = repeatCursors[group]! + 1;
        } else {
          const list = chosen.from === 'large' ? largeQueues[group]! : queue;
          const cursors = chosen.from === 'large' ? largeHeads : heads;
          const head = cursors[group]!;
          list[chosen.index] = list[head]!;
          list[head] = photo;
          cursors[group] = head + 1;
          photosLeft -= 1;
        }
        hang({
          x: best.x,
          y: top,
          width: best.w,
          height: best.h,
          natural: heightFor(photo, best.w),
          group,
          photo,
          repeat,
          large: best.large,
        });
        return true;
      };
      let done = false;
      return {
        cells,
        /** A line that already runs straight from `from` (rows, this sweep's). */
        carryLine: (e: number, from: number) => {
          if (e > 0 && e < width) lineStart[e] = Math.min(lineStart[e]!, from);
        },
        /** How far from the middle its next frame would hang. */
        distance: () => (done ? Number.POSITIVE_INFINITY : nextStretch()?.distance ?? Number.POSITIVE_INFINITY),
        step: () => {
          if (!done && !step()) done = true;
          return !done;
        },
      };
    };

    // Start from the featured photo nearest the middle: it hangs first, and
    // the wall packs outward from it, down from its top edge (so frames
    // beside it pack against its sides) and, mirrored, up from that edge.
    // The edge between the two is staggered in blocks so it never reads as
    // a straight line across the wall.
    const middle = { x: width / 2, y: height / 2 };
    const central = heroes.reduce<HeroBlock | null>((best, hero) => {
      const distance = (h: HeroBlock) => Math.hypot(h.x + h.width / 2 - middle.x, (h.y + h.height / 2 - middle.y) / ROWS_PER_UNIT);
      return !best || distance(hero) < distance(best) ? hero : best;
    }, null);
    const cells: Cell[] = [];
    // Without a featured photo the wall grows out from its middle all the same.
    const middleX = central ? central.x : Math.round(width / 2);
    const middleWidth = central ? central.width : 0;
    const middleTop = central ? central.y : Math.round(height / 2);
    const center = central
      ? { x: central.x + central.width / 2, y: central.y + central.height / 2 }
      : { x: width / 2, y: height / 2 };
    const edgeTop = new Array<number>(width).fill(middleTop);
    const stagger = (from: number, to: number, direction: 1 | -1) => {
      let previous = 0;
      let block = 0;
      for (let x = from; direction > 0 ? x < to : x > to; block += 1) {
        const hashed = stableIndex(`${central?.group ?? -1}:${direction}:${block}`);
        let blockWidth = EDGE_BLOCK_WIDTHS[hashed % EDGE_BLOCK_WIDTHS.length]!;
        const room = Math.abs(to - x);
        if (room - blockWidth < Math.min(...WIDTHS)) blockWidth = room;
        let offset = EDGE_OFFSETS[hashed % EDGE_OFFSETS.length]!;
        if (offset === previous) offset = EDGE_OFFSETS[(hashed + 1) % EDGE_OFFSETS.length]!;
        previous = offset;
        for (let i = 0; i < blockWidth; i += 1) {
          const column = x + direction * i;
          edgeTop[column] = Math.min(Math.max(middleTop + offset, 0), height);
        }
        x += direction * blockWidth;
      }
    };
    stagger(middleX + middleWidth, width, 1);
    stagger(middleX - 1, -1, -1);
    const lowestEdge = Math.min(...edgeTop);
    const highestEdge = Math.max(...edgeTop);
    // Other albums' featured photos go to whichever sweep they lie in.
    const below: HeroBlock[] = [];
    const aboveEdge: HeroBlock[] = [];
    for (const hero of heroes) {
      if (hero === central) continue;
      if (hero.y >= highestEdge) below.push(hero);
      else if (hero.y + hero.height <= lowestEdge) aboveEdge.push(hero);
      else if (highestEdge + hero.height <= height - HERO_MARGIN * ROWS_PER_UNIT) below.push({ ...hero, y: highestEdge });
      else if (lowestEdge - hero.height >= HERO_MARGIN * ROWS_PER_UNIT) aboveEdge.push({ ...hero, y: lowestEdge - hero.height });
    }
    const downInit = edgeTop.map((top, x) =>
      central && x >= central.x && x < central.x + central.width ? central.y + central.height : top,
    );
    const down = makeSweep(downInit, height, below, (top) => top, center, central ? [central] : []);
    // The upward sweep packs mirrored: its rows count up from the edge.
    const mirror = highestEdge;
    const mirrored = aboveEdge.map((hero) => ({ ...hero, y: mirror - (hero.y + hero.height) }));
    const up = makeSweep(edgeTop.map((top) => mirror - top), mirror, mirrored, (top) => mirror - top, center);
    if (central) {
      // Above the featured photo the lines along its sides carry on too.
      up.carryLine(central.x, mirror - central.y - central.height);
      up.carryLine(central.x + central.width, mirror - central.y - central.height);
    }
    // Whichever sweep's next frame is nearer the middle hangs it, so the
    // wall grows outward evenly; repeats (if any) end up at the far edges,
    // where the wall loops.
    let downOpen = true;
    let upOpen = true;
    while (downOpen || upOpen) {
      if (downOpen && (!upOpen || down.distance() <= up.distance())) downOpen = down.step();
      else upOpen = up.step();
    }
    cells.push(...down.cells);
    for (const cell of up.cells) cells.push({ ...cell, y: mirror - (cell.y + cell.height) });
    const placed = [
      ...(central ? [central] : []),
      ...below,
      ...mirrored.map((hero) => ({ ...hero, y: mirror - (hero.y + hero.height) })),
    ];
    return { cells, heroes: placed, photosLeft };
  };

  // The shortest wall that holds every photo (repeats fill what's left):
  // grow until one fits, then narrow in between it and the last that didn't.
  let low = Math.floor(startHeight * 0.85);
  let height = low;
  let pass = pack(height);
  for (let attempt = 0; attempt < HEIGHT_ATTEMPTS && pass.photosLeft > 0; attempt += 1) {
    low = height;
    height = Math.ceil(height * HEIGHT_GROWTH);
    pass = pack(height);
  }
  for (let step = 0; step < HEIGHT_SEARCH_STEPS && height - low > ROWS_PER_UNIT; step += 1) {
    const middle = Math.round((low + height) / 2);
    const tried = pack(middle);
    if (tried.photosLeft > 0) {
      low = middle;
    } else {
      height = middle;
      pass = tried;
    }
  }

  const slots: Slot[] = [];
  const spanned = new Map<string, PhotoQueryRecord>();
  for (const cell of pass.cells) {
    if (cell.large && !cell.repeat) spanned.set(cell.photo.id, cell.photo);
    slots.push({
      x: cell.x * unit,
      y: cell.y * row,
      width: cell.width * unit,
      height: cell.height * row,
      lane: Math.floor(cell.x / UNITS_PER_COLUMN),
      group: cell.group,
      bucket: (cell.large ? SPAN_BUCKET_OFFSET : 0) + aspectBucket(cell.photo),
      repeat: cell.repeat,
    });
  }
  for (const hero of pass.heroes) {
    // The featured tile is its exact size, centered in the cells it takes.
    // When the screen's height limits it, it takes the cells' full width
    // (its mat a little wider), so no strip of bare wall shows beside it.
    const heightLimited = options.heroBox !== undefined && hero.size.height >= options.heroBox.height - 0.5;
    const tileWidth = heightLimited ? hero.width * unit : hero.size.width;
    slots.push({
      x: hero.x * unit + (hero.width * unit - tileWidth) / 2,
      y: hero.y * row + (hero.height * row - hero.size.height) / 2,
      width: tileWidth,
      height: hero.size.height,
      lane: Math.floor(hero.x / UNITS_PER_COLUMN),
      group: hero.group,
      bucket: -1,
      repeat: false,
      hero: hero.photo,
    });
  }
  // A featured photo that found no place is hung like any other photo.
  const placedGroups = new Set(pass.heroes.map((hero) => hero.group));
  const missing = heroPhotos.some((photo, group) => photo && !placedGroups.has(group));
  if (missing) {
    return buildGalleryWallLayout({ ...options, heroBox: undefined });
  }

  const worldWidth = width * unit;
  const contentHeight = height * row;
  const assigned = placeCenterOut(slots, groups, worldWidth, contentHeight, spanned);
  const featuredPhotoIds = new Set<string>();
  const tiles: PackedTile[] = slots.map((slot, index) => {
    const photo = assigned.photos[index]!;
    if (slot.hero) featuredPhotoIds.add(photo.id);
    return {
      photoId: photo.id,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      sourceWidth: photo.width,
      sourceHeight: photo.height,
      lane: slot.lane,
      mosaic: 0,
      ...(assigned.duplicate[index] ? { duplicate: true } : {}),
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
