import { useMemo, useState, type ChangeEvent } from 'react';
import { getAppSurfaceHref } from '../../app/appSurface.js';
import { MOSAIC_LAB_CATEGORY_APPEARANCE } from './appearance.js';
import { MosaicLabPixiStage } from './MosaicLabPixiStage.js';
import {
  buildMosaicLabSceneFromRecipe,
  computeMosaicLabRecipeTotalCount,
  createEditableMosaicLabBenchRecipe,
  createInitialMosaicLabRecipeBenchState,
  deleteMosaicLabBenchRecipe,
  duplicateSelectedMosaicLabBenchRecipe,
  getMosaicLabBenchRecipe,
  getMosaicLabBenchRecipeSourceCount,
  MOSAIC_LAB_CATEGORY_FAMILIES,
  MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY,
  MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS,
  MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS_BY_KEY,
  MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS,
  selectMosaicLabBenchRecipe,
  updateMosaicLabBenchRecipeName,
  updateMosaicLabBenchRecipeSourceCount,
  type MosaicLabRecipeDefinition,
} from './model/index.js';

function createSeedToken(): string {
  const token =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `lab-seed-${token}`;
}

function formatPassFail(passes: boolean): string {
  return passes ? 'Pass' : 'Fail';
}

function formatRecipeOrigin(origin: 'starter' | 'user'): string {
  return origin === 'starter' ? 'Starter recipe' : 'Editable recipe';
}

interface MosaicLabCountEntry {
  label: string;
  count: number;
}

function formatSeamLength(length: number): string {
  return `${Math.round(length)} px`;
}

function formatArea(area: number): string {
  return `${Math.round(area)}px²`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

function formatCountList(entries: readonly MosaicLabCountEntry[]): string {
  if (entries.length === 0) {
    return 'none';
  }

  return entries.map((entry) => `${entry.label}: ${entry.count}`).join(' · ');
}

function readChecked(event: ChangeEvent<HTMLInputElement>): boolean {
  return event.currentTarget.checked;
}

function readNonNegativeInteger(event: ChangeEvent<HTMLInputElement>): number {
  const value = Number.parseInt(event.currentTarget.value, 10);

  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

export function MosaicLabShell(): JSX.Element {
  const [recipeBenchState, setRecipeBenchState] = useState(() => createInitialMosaicLabRecipeBenchState());
  const [seed, setSeed] = useState('lab-seed-01');
  const [globalZoom, setGlobalZoom] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [showCategories, setShowCategories] = useState(true);
  const [showSeams, setShowSeams] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  const selectedRecipe: MosaicLabRecipeDefinition =
    getMosaicLabBenchRecipe(recipeBenchState, recipeBenchState.selectedRecipeKey) ??
    MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS[2]!;
  const selectedRecipeTotalCount = computeMosaicLabRecipeTotalCount(selectedRecipe);
  const selectedRecipeEditable = selectedRecipe.origin === 'user';

  const scene = useMemo(
    () => buildMosaicLabSceneFromRecipe({ recipe: selectedRecipe, seed, globalZoom }),
    [selectedRecipe, seed, globalZoom],
  );

  const sourceRecipeDiagnostics = useMemo(() => {
    const activeArchetypes = selectedRecipe.sourceCounts
      .filter((sourceCount) => sourceCount.count > 0)
      .map((sourceCount) => {
        const definition = MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS_BY_KEY[sourceCount.archetypeKey];
        return {
          key: sourceCount.archetypeKey,
          label: definition.name,
          count: sourceCount.count,
          family: definition.family,
          sourceOrientation: definition.sourceOrientation,
        };
      })
      .sort((left, right) => {
        if (left.count !== right.count) {
          return right.count - left.count;
        }

        return left.label.localeCompare(right.label);
      });

    const sourceFamilyCounts = {
      standard: 0,
      nonstandard: 0,
    };
    const sourceOrientationCounts = {
      landscape: 0,
      portrait: 0,
      square: 0,
    };

    for (const archetype of activeArchetypes) {
      sourceFamilyCounts[archetype.family] += archetype.count;
      sourceOrientationCounts[archetype.sourceOrientation] += archetype.count;
    }

    const dominantArchetype = activeArchetypes[0] ?? null;

    return {
      activeArchetypes,
      activeArchetypeCount: activeArchetypes.length,
      sourceFamilyEntries: [
        { label: 'standard', count: sourceFamilyCounts.standard },
        { label: 'nonstandard', count: sourceFamilyCounts.nonstandard },
      ].filter((entry) => entry.count > 0),
      sourceOrientationEntries: [
        { label: 'landscape', count: sourceOrientationCounts.landscape },
        { label: 'portrait', count: sourceOrientationCounts.portrait },
        { label: 'square', count: sourceOrientationCounts.square },
      ].filter((entry) => entry.count > 0),
      dominantArchetype,
    };
  }, [selectedRecipe]);

  const placementFootprintEntries = useMemo(() => {
    if (scene.status !== 'packed') {
      return [];
    }

    return Object.entries(scene.result.metrics.footprintUsage.footprintCounts)
      .filter((entry) => entry[1] > 0)
      .map(([footprintKey, count]) => {
        const typedFootprintKey = footprintKey as keyof typeof MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY;
        return {
          label: MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY[typedFootprintKey].name,
          count,
        };
      })
      .sort((left, right) => {
        if (left.count !== right.count) {
          return right.count - left.count;
        }

        return left.label.localeCompare(right.label);
      });
  }, [scene]);

  return (
    <main
      className="mosaic-lab"
      data-testid="mosaic-lab-shell"
      data-app-surface="mosaic-lab"
      data-scroll-model="bounded-stage"
    >
      <section className="mosaic-lab__intro" aria-live="polite">
        <p className="mosaic-lab__eyebrow">Mosaic Lab</p>
        <h1 className="mosaic-lab__title">Synthetic recipe and placement lab</h1>
        <p className="mosaic-lab__body">
          Tune the selected synthetic recipe, seed, zoom, and stage overlays in one place. Each
          edit repacks the scene into the Pixi workspace below while keeping source recipe signals
          separate from placement structure diagnostics.
        </p>
        <p className="mosaic-lab__body">
          The lab stays synthetic-only and the real photo wall remains the default return path.
        </p>
        <div className="mosaic-lab__actions">
          <a
            className="mosaic-lab__link"
            data-testid="mosaic-lab-exit"
            href={getAppSurfaceHref('wall')}
          >
            Return to photo wall
          </a>
        </div>
      </section>

      <section className="mosaic-lab__panel mosaic-lab__panel--controls">
        <header className="mosaic-lab__panel-header">
          <p className="mosaic-lab__panel-eyebrow">Integrated lab session</p>
          <h2 className="mosaic-lab__panel-title">
            Selected recipe, packer output, and Pixi stage stay in sync
          </h2>
          <p className="mosaic-lab__body">
            Use the roster and editor to branch synthetic recipes, then inspect the seeded packed
            result below without leaving the lab shell.
          </p>
        </header>

        <div className="mosaic-lab__recipe-chip-row" data-testid="mosaic-lab-session-summary">
          <span className="mosaic-lab__recipe-chip">Recipe · {selectedRecipe.name}</span>
          <span className="mosaic-lab__recipe-chip">Seed · {scene.seed}</span>
          <span className="mosaic-lab__recipe-chip">Layout zoom · {formatZoom(globalZoom)}</span>
          <span className="mosaic-lab__recipe-chip">Preset · {scene.presetKey}</span>
          <span className="mosaic-lab__recipe-chip">
            Diagnostics · {showDiagnostics ? 'on' : 'off'}
          </span>
        </div>

        <div className="mosaic-lab__toolbar">
          <div className="mosaic-lab__field mosaic-lab__field--seed">
            <span className="mosaic-lab__field-label">Seed</span>
            <code className="mosaic-lab__seed" data-testid="mosaic-lab-seed">
              {seed}
            </code>
          </div>

          <button
            className="mosaic-lab__button"
            data-testid="mosaic-lab-regenerate"
            type="button"
            onClick={() => setSeed(createSeedToken())}
          >
            Regenerate seed
          </button>

          <label className="mosaic-lab__field mosaic-lab__field--zoom">
            <span className="mosaic-lab__field-label">Layout zoom</span>
            <div className="mosaic-lab__range-row">
              <input
                className="mosaic-lab__range"
                data-testid="mosaic-lab-zoom"
                type="range"
                min="0.75"
                max="1.8"
                step="0.05"
                value={globalZoom}
                onChange={(event) => setGlobalZoom(Number(event.currentTarget.value))}
              />
              <output className="mosaic-lab__range-value" data-testid="mosaic-lab-zoom-value">
                {formatZoom(globalZoom)}
              </output>
            </div>
          </label>

          <div className="mosaic-lab__field">
            <span className="mosaic-lab__field-label">Current recipe</span>
            <div className="mosaic-lab__seed" data-testid="mosaic-lab-current-recipe-key">
              {selectedRecipe.name}
            </div>
          </div>
        </div>

        <div className="mosaic-lab__overlay-controls" data-testid="mosaic-lab-overlay-controls">
          <label className="mosaic-lab__toggle">
            <input
              checked={showLabels}
              data-testid="mosaic-lab-overlay-toggle-labels"
              type="checkbox"
              onChange={(event) => setShowLabels(readChecked(event))}
            />
            <span>Labels</span>
          </label>
          <label className="mosaic-lab__toggle">
            <input
              checked={showCategories}
              data-testid="mosaic-lab-overlay-toggle-categories"
              type="checkbox"
              onChange={(event) => setShowCategories(readChecked(event))}
            />
            <span>Categories</span>
          </label>
          <label className="mosaic-lab__toggle">
            <input
              checked={showSeams}
              data-testid="mosaic-lab-overlay-toggle-seams"
              type="checkbox"
              onChange={(event) => setShowSeams(readChecked(event))}
            />
            <span>Seams</span>
          </label>
          <label className="mosaic-lab__toggle">
            <input
              checked={showDiagnostics}
              data-testid="mosaic-lab-overlay-toggle-diagnostics"
              type="checkbox"
              onChange={(event) => setShowDiagnostics(readChecked(event))}
            />
            <span>Gap/overlap diagnostics</span>
          </label>
        </div>

        <div className="mosaic-lab__bench">
          <section className="mosaic-lab__bench-panel" data-testid="mosaic-lab-recipe-roster">
            <header className="mosaic-lab__panel-header">
              <p className="mosaic-lab__panel-eyebrow">Recipe roster</p>
              <h2 className="mosaic-lab__panel-title">Starter recipes plus editable comparisons</h2>
              <p className="mosaic-lab__body">
                Keep the starter recipes visible, then branch editable recipes for source archetype
                comparisons against the current seeded packer output.
              </p>
            </header>

            <div className="mosaic-lab__bench-actions">
              <button
                className="mosaic-lab__button"
                data-testid="mosaic-lab-create-recipe"
                type="button"
                onClick={() =>
                  setRecipeBenchState((currentState) =>
                    createEditableMosaicLabBenchRecipe(currentState, {
                      baseRecipeKey: currentState.selectedRecipeKey,
                    }),
                  )
                }
              >
                New editable recipe
              </button>
              <button
                className="mosaic-lab__button"
                data-testid="mosaic-lab-duplicate-recipe"
                type="button"
                onClick={() =>
                  setRecipeBenchState((currentState) =>
                    duplicateSelectedMosaicLabBenchRecipe(currentState),
                  )
                }
              >
                Duplicate selected
              </button>
            </div>

            <div className="mosaic-lab__roster-groups">
              <div className="mosaic-lab__roster-group">
                <h3 className="mosaic-lab__stage-title">Starter recipes</h3>
                <div className="mosaic-lab__roster-list">
                  {MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS.map((recipe) => {
                    const selected = recipe.key === selectedRecipe.key;
                    return (
                      <button
                        className="mosaic-lab__roster-entry"
                        data-origin={recipe.origin}
                        data-selected={selected}
                        data-testid={`mosaic-lab-recipe-roster-entry-${recipe.key}`}
                        key={recipe.key}
                        type="button"
                        onClick={() =>
                          setRecipeBenchState((currentState) =>
                            selectMosaicLabBenchRecipe(currentState, recipe.key),
                          )
                        }
                      >
                        <strong>{recipe.name}</strong>
                        <span>
                          {formatRecipeOrigin(recipe.origin)} ·{' '}
                          {computeMosaicLabRecipeTotalCount(recipe)} sources
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mosaic-lab__roster-group">
                <h3 className="mosaic-lab__stage-title">Editable recipes</h3>
                <div className="mosaic-lab__roster-list">
                  {recipeBenchState.userRecipes.map((recipe) => {
                    const selected = recipe.key === selectedRecipe.key;
                    return (
                      <button
                        className="mosaic-lab__roster-entry"
                        data-origin={recipe.origin}
                        data-selected={selected}
                        data-testid={`mosaic-lab-recipe-roster-entry-${recipe.key}`}
                        key={recipe.key}
                        type="button"
                        onClick={() =>
                          setRecipeBenchState((currentState) =>
                            selectMosaicLabBenchRecipe(currentState, recipe.key),
                          )
                        }
                      >
                        <strong>{recipe.name}</strong>
                        <span>
                          {formatRecipeOrigin(recipe.origin)} ·{' '}
                          {computeMosaicLabRecipeTotalCount(recipe)} sources
                        </span>
                        <span>
                          {recipe.clonedFromRecipeKey
                            ? `Cloned from ${recipe.clonedFromRecipeKey}`
                            : 'Independent draft'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="mosaic-lab__bench-panel" data-testid="mosaic-lab-recipe-editor">
            <header className="mosaic-lab__panel-header">
              <p className="mosaic-lab__panel-eyebrow">Source recipe editor</p>
              <h2 className="mosaic-lab__panel-title">Adjust source archetype counts</h2>
              <p className="mosaic-lab__body">
                Edit the synthetic source pool here. Each recipe name or count change repacks the
                selected scene and updates the metrics and stage below.
              </p>
            </header>

            <label className="mosaic-lab__field">
              <span className="mosaic-lab__field-label">Recipe name</span>
              <input
                className="mosaic-lab__text-input"
                data-testid="mosaic-lab-recipe-name-input"
                disabled={!selectedRecipeEditable}
                readOnly={!selectedRecipeEditable}
                type="text"
                value={selectedRecipe.name}
                onChange={(event) => {
                  const nextName = event.currentTarget.value;
                  setRecipeBenchState((currentState) =>
                    updateMosaicLabBenchRecipeName(currentState, {
                      recipeKey: selectedRecipe.key,
                      name: nextName,
                    }),
                  );
                }}
              />
            </label>

            {selectedRecipeEditable ? (
              <p className="mosaic-lab__body" data-testid="mosaic-lab-editable-recipe-note">
                Editable recipe names and source counts update the roster, metrics, and selected
                lab study immediately.
              </p>
            ) : null}

            <div className="mosaic-lab__recipe-chip-row">
              <span
                className="mosaic-lab__recipe-chip"
                data-testid="mosaic-lab-selected-recipe-origin"
              >
                {formatRecipeOrigin(selectedRecipe.origin)}
              </span>
              <span className="mosaic-lab__recipe-chip" data-testid="mosaic-lab-selected-recipe-total">
                {selectedRecipeTotalCount} sources
              </span>
              <span className="mosaic-lab__recipe-chip" data-testid="mosaic-lab-selected-recipe-preset">
                Layout preset · {scene.presetKey}
              </span>
              <span className="mosaic-lab__recipe-chip" data-testid="mosaic-lab-selected-recipe-cloned-from">
                {selectedRecipe.clonedFromRecipeKey
                  ? `Cloned from ${selectedRecipe.clonedFromRecipeKey}`
                  : 'Independent draft'}
              </span>
            </div>

            {!selectedRecipeEditable ? (
              <p className="mosaic-lab__body" data-testid="mosaic-lab-starter-edit-note">
                Starter recipes stay immutable so they remain available as comparison anchors.
                Duplicate one or create a new editable recipe to change the recipe name or source
                archetype counts.
              </p>
            ) : null}

            <div className="mosaic-lab__source-grid">
              {MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS.map((definition) => (
                <label className="mosaic-lab__source-field" key={definition.key}>
                  <span className="mosaic-lab__source-label">{definition.name}</span>
                  <span className="mosaic-lab__source-detail">
                    {definition.family} source · {definition.sourceOrientation}
                  </span>
                  <input
                    className="mosaic-lab__number-input"
                    data-testid={`mosaic-lab-source-count-${definition.key}`}
                    disabled={!selectedRecipeEditable}
                    min="0"
                    step="1"
                    type="number"
                    value={getMosaicLabBenchRecipeSourceCount(selectedRecipe, definition.key)}
                    onChange={(event) => {
                      const nextCount = readNonNegativeInteger(event);
                      setRecipeBenchState((currentState) =>
                        updateMosaicLabBenchRecipeSourceCount(currentState, {
                          recipeKey: selectedRecipe.key,
                          archetypeKey: definition.key,
                          count: nextCount,
                        }),
                      );
                    }}
                  />
                </label>
              ))}
            </div>

            <div className="mosaic-lab__actions">
              <button
                className="mosaic-lab__button"
                data-testid="mosaic-lab-delete-recipe"
                disabled={!selectedRecipeEditable}
                type="button"
                onClick={() =>
                  setRecipeBenchState((currentState) =>
                    deleteMosaicLabBenchRecipe(currentState, selectedRecipe.key),
                  )
                }
              >
                Delete selected recipe
              </button>
            </div>
          </section>
        </div>
      </section>

      {scene.status === 'packed' ? (
        <>
          <section className="mosaic-lab__metrics" data-testid="mosaic-lab-metrics">
            <article className="mosaic-lab__metric-card">
              <span className="mosaic-lab__metric-label">Recipe</span>
              <strong className="mosaic-lab__metric-value" data-testid="mosaic-lab-metric-recipe">
                {scene.recipeName}
              </strong>
              <span className="mosaic-lab__metric-detail">
                {formatRecipeOrigin(selectedRecipe.origin)} · {selectedRecipeTotalCount} sources ·
                preset {scene.presetKey}
              </span>
            </article>

            <article className="mosaic-lab__metric-card">
              <span className="mosaic-lab__metric-label">Source archetypes</span>
              <strong
                className="mosaic-lab__metric-value"
                data-testid="mosaic-lab-metric-source-archetypes"
              >
                {sourceRecipeDiagnostics.activeArchetypeCount} active
              </strong>
              <span className="mosaic-lab__metric-detail">
                {sourceRecipeDiagnostics.dominantArchetype
                  ? `largest ${sourceRecipeDiagnostics.dominantArchetype.label} · ${formatPercent(sourceRecipeDiagnostics.dominantArchetype.count / selectedRecipeTotalCount)} · ${formatCountList(sourceRecipeDiagnostics.sourceFamilyEntries)}`
                  : 'no active source archetypes'}
              </span>
            </article>

            <article className="mosaic-lab__metric-card">
              <span className="mosaic-lab__metric-label">Placement categories</span>
              <strong className="mosaic-lab__metric-value" data-testid="mosaic-lab-metric-total-tiles">
                {scene.result.metrics.totalTileCount} tiles
              </strong>
              <span className="mosaic-lab__metric-detail">
                {scene.result.metrics.placementCategoryVariety} active categories ·{' '}
                {MOSAIC_LAB_CATEGORY_FAMILIES.map((family) =>
                  `${family}: ${scene.result.metrics.placementCategoryCounts[family]}`,
                ).join(' · ')}
              </span>
            </article>

            <article className="mosaic-lab__metric-card">
              <span className="mosaic-lab__metric-label">Placement footprints</span>
              <strong
                className="mosaic-lab__metric-value"
                data-testid="mosaic-lab-metric-placement-footprints"
              >
                {scene.result.metrics.footprintUsage.footprintVariety} unique
              </strong>
              <span className="mosaic-lab__metric-detail">
                {placementFootprintEntries.length > 0
                  ? `${formatCountList(placementFootprintEntries)} · largest share ${MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY[scene.result.metrics.footprintUsage.dominantFootprintKey ?? 'standard-landscape'].name} ${formatPercent(scene.result.metrics.footprintUsage.dominantFootprintShare)}`
                  : 'no packed footprints'}
              </span>
            </article>

            <article
              className="mosaic-lab__metric-card"
              data-status={scene.result.metrics.blackSpace.passes ? 'pass' : 'fail'}
            >
              <span className="mosaic-lab__metric-label">Black space</span>
              <strong
                className="mosaic-lab__metric-value"
                data-testid="mosaic-lab-metric-black-space"
              >
                {formatPassFail(scene.result.metrics.blackSpace.passes)}
              </strong>
              <span className="mosaic-lab__metric-detail">
                uncovered {formatArea(scene.result.metrics.blackSpace.uncoveredArea)}
              </span>
            </article>

            <article
              className="mosaic-lab__metric-card"
              data-status={scene.result.metrics.overlap.passes ? 'pass' : 'fail'}
            >
              <span className="mosaic-lab__metric-label">Overlap</span>
              <strong className="mosaic-lab__metric-value" data-testid="mosaic-lab-metric-overlap">
                {formatPassFail(scene.result.metrics.overlap.passes)}
              </strong>
              <span className="mosaic-lab__metric-detail">
                overlap {formatArea(scene.result.metrics.overlap.overlapArea)}
              </span>
            </article>

            <article className="mosaic-lab__metric-card">
              <span className="mosaic-lab__metric-label">Anti-grid seams</span>
              <strong
                className="mosaic-lab__metric-value"
                data-testid="mosaic-lab-metric-anti-grid-seams"
              >
                H {scene.result.metrics.seamDiagnostics.fullSpanHorizontalSeamCount} · V{' '}
                {scene.result.metrics.seamDiagnostics.fullSpanVerticalSeamCount}
              </strong>
              <span className="mosaic-lab__metric-detail">
                {scene.result.metrics.seamDiagnostics.horizontalSeamCount} horizontal seams ·{' '}
                {scene.result.metrics.seamDiagnostics.verticalSeamCount} vertical seams · longest H{' '}
                {formatSeamLength(scene.result.metrics.seamDiagnostics.longestHorizontalSeam)} · V{' '}
                {formatSeamLength(scene.result.metrics.seamDiagnostics.longestVerticalSeam)}
              </span>
            </article>
          </section>

          <section className="mosaic-lab__workspace">
            <aside className="mosaic-lab__panel mosaic-lab__panel--legend">
              <header className="mosaic-lab__panel-header">
                <p className="mosaic-lab__panel-eyebrow">Inspection</p>
                <h2 className="mosaic-lab__panel-title">Placement category legend</h2>
              </header>

              <div className="mosaic-lab__legend-list">
                {MOSAIC_LAB_CATEGORY_FAMILIES.map((family) => {
                  const appearance = MOSAIC_LAB_CATEGORY_APPEARANCE[family];
                  return (
                    <article className="mosaic-lab__legend-item" key={family}>
                      <span
                        className="mosaic-lab__legend-swatch"
                        style={{ background: appearance.accent }}
                      />
                      <div>
                        <strong>{family}</strong>
                        <p>
                          {scene.result.metrics.placementCategoryCounts[family]} tiles currently placed
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>

              <h3 className="mosaic-lab__stage-title">Source recipe signals</h3>
              <dl className="mosaic-lab__facts" data-testid="mosaic-lab-source-recipe-signals">
                <div>
                  <dt>Visible seed</dt>
                  <dd>{scene.seed}</dd>
                </div>
                <div>
                  <dt>Current recipe</dt>
                  <dd>{selectedRecipe.name}</dd>
                </div>
                <div>
                  <dt>Recipe origin</dt>
                  <dd>{formatRecipeOrigin(selectedRecipe.origin)}</dd>
                </div>
                <div>
                  <dt>Source pool</dt>
                  <dd>{selectedRecipeTotalCount} sources</dd>
                </div>
                <div>
                  <dt>Active archetypes</dt>
                  <dd>{sourceRecipeDiagnostics.activeArchetypeCount}</dd>
                </div>
                <div>
                  <dt>Largest archetype</dt>
                  <dd>
                    {sourceRecipeDiagnostics.dominantArchetype
                      ? `${sourceRecipeDiagnostics.dominantArchetype.label} · ${sourceRecipeDiagnostics.dominantArchetype.count} sources · ${formatPercent(sourceRecipeDiagnostics.dominantArchetype.count / selectedRecipeTotalCount)}`
                      : 'none'}
                  </dd>
                </div>
                <div>
                  <dt>Source families</dt>
                  <dd>{formatCountList(sourceRecipeDiagnostics.sourceFamilyEntries)}</dd>
                </div>
                <div>
                  <dt>Source orientations</dt>
                  <dd>{formatCountList(sourceRecipeDiagnostics.sourceOrientationEntries)}</dd>
                </div>
                <div>
                  <dt>Cloned from</dt>
                  <dd>{selectedRecipe.clonedFromRecipeKey ?? 'Independent draft'}</dd>
                </div>
                <div>
                  <dt>Layout preset</dt>
                  <dd>{scene.presetKey}</dd>
                </div>
              </dl>

              <h3 className="mosaic-lab__stage-title">Placement structure signals</h3>
              <dl className="mosaic-lab__facts" data-testid="mosaic-lab-placement-structure-signals">
                <div>
                  <dt>Logical frame</dt>
                  <dd>
                    {scene.result.contract.frame.width}×{scene.result.contract.frame.height}
                  </dd>
                </div>
                <div>
                  <dt>Layout zoom</dt>
                  <dd>{formatZoom(scene.result.contract.globalZoom)}</dd>
                </div>
                <div>
                  <dt>Placement categories</dt>
                  <dd>
                    {scene.result.metrics.placementCategoryVariety} active ·{' '}
                    {MOSAIC_LAB_CATEGORY_FAMILIES.map((family) =>
                      `${family}: ${scene.result.metrics.placementCategoryCounts[family]}`,
                    ).join(' · ')}
                  </dd>
                </div>
                <div>
                  <dt>Placement footprints</dt>
                  <dd>
                    {scene.result.metrics.footprintUsage.footprintVariety} unique ·{' '}
                    {formatCountList(placementFootprintEntries)}
                  </dd>
                </div>
                <div>
                  <dt>Largest footprint share</dt>
                  <dd>
                    {scene.result.metrics.footprintUsage.dominantFootprintKey
                      ? `${MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY[scene.result.metrics.footprintUsage.dominantFootprintKey].name} · ${scene.result.metrics.footprintUsage.dominantFootprintCount} tiles · ${formatPercent(scene.result.metrics.footprintUsage.dominantFootprintShare)}`
                      : 'none'}
                  </dd>
                </div>
                <div>
                  <dt>Full-span seams</dt>
                  <dd>
                    {scene.result.metrics.seamDiagnostics.fullSpanHorizontalSeamCount} horizontal ·{' '}
                    {scene.result.metrics.seamDiagnostics.fullSpanVerticalSeamCount} vertical
                  </dd>
                </div>
                <div>
                  <dt>Detected seams</dt>
                  <dd>
                    {scene.result.metrics.seamDiagnostics.horizontalSeamCount} horizontal ·{' '}
                    {scene.result.metrics.seamDiagnostics.verticalSeamCount} vertical
                  </dd>
                </div>
                <div>
                  <dt>Longest seams</dt>
                  <dd>
                    H {formatSeamLength(scene.result.metrics.seamDiagnostics.longestHorizontalSeam)} · V{' '}
                    {formatSeamLength(scene.result.metrics.seamDiagnostics.longestVerticalSeam)}
                  </dd>
                </div>
                <div>
                  <dt>Diagnostics</dt>
                  <dd>
                    {scene.result.metrics.blackSpace.uncoveredRects.length} gaps ·{' '}
                    {scene.result.metrics.overlap.overlapRects.length} overlaps
                  </dd>
                </div>
                <div>
                  <dt>Stage mode</dt>
                  <dd>Synthetic Pixi packed stage</dd>
                </div>
                <div>
                  <dt>Workspace controls</dt>
                  <dd>Wheel pan · Shift/Ctrl/⌘ + wheel zoom · drag pan</dd>
                </div>
              </dl>
            </aside>

            <section className="mosaic-lab__viewport" aria-label="Synthetic mosaic study board">
              <MosaicLabPixiStage
                scene={scene}
                recipeName={selectedRecipe.name}
                seed={scene.seed}
                sourceCount={selectedRecipeTotalCount}
                globalZoom={globalZoom}
                showLabels={showLabels}
                showCategories={showCategories}
                showSeams={showSeams}
                showDiagnostics={showDiagnostics}
              />
            </section>
          </section>
        </>
      ) : (
        <section
          className="mosaic-lab__panel mosaic-lab__panel--failure"
          data-testid="mosaic-lab-failure"
        >
          <p className="mosaic-lab__eyebrow">Packing failed</p>
          <h2 className="mosaic-lab__panel-title">Synthetic arrangement unavailable for this seed</h2>
          <p className="mosaic-lab__body">{scene.result.failureReason}</p>
          <div className="mosaic-lab__actions">
            <button
              className="mosaic-lab__button"
              type="button"
              onClick={() => setSeed(createSeedToken())}
            >
              Try another seed
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
