// A paint recipe as a page writes it, turned into the surfaces module's recipe and settings. Shared by the build step
// (`./paint`) and the run-time path (`./paint-live`), so both paint the same thing from the same request.

/** The surfaces module's ready recipes, by the name a request gives. */
export const PRESETS = {
  paper: 'PAPER',
  knit: 'KNIT',
  'painted-floral': 'PAINTED_FLORAL',
  'painted-cloth': 'PAINTED_CLOTH',
}

/**
 * The recipe and settings a request paints: a preset by name (with `with` laid over it) or a whole `recipe`, at
 * `seed`, `width` and `height`.
 */
export function recipeOf(request, surfaces) {
  if (!request || typeof request !== 'object') throw new Error('keel paint: a recipe is an object')
  const named = request.surface && PRESETS[request.surface]
  if (request.surface && !named)
    throw new Error(
      `keel paint: no surface \`${request.surface}\`; one of ${Object.keys(PRESETS).join(', ')}`,
    )
  const base = named ? surfaces[named] : request.recipe
  if (!base) throw new Error('keel paint: give `surface` (a preset) or `recipe`')
  const recipe = request.with ? { ...base, ...request.with } : base
  const settings = { seed: request.seed ?? 0, width: request.width ?? 1024 }
  if (request.height !== undefined) settings.height = request.height
  return { recipe, settings }
}
