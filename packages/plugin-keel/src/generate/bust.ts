// The portrait's bust, its parts meshed: the slow half of a portrait (a few hundred ms at `hero`). From the sitter's
// settings, so a page can ask before it has loaded the module, or from a recipe.
import {
  buildBust,
  digestOf,
  portraitSettings,
  sitterOf,
  type Bust,
  type BustRecipe,
  type Palette,
  type PortraitSettings,
} from '../../vendor/modules/portrait.mjs'

/** A recipe, or the settings `sitterOf` makes one from (`{ seed: 7, face: 'A', detail: 'hero' }`). */
export type BustJob = BustRecipe | Partial<PortraitSettings>

/** A bust, the digest of its recipe, and the palette when it came from settings. */
export type BustResult = Bust & { readonly digest: string; readonly palette?: Palette }

export function run(job: BustJob): BustResult {
  if (typeof job.detail === 'object') return { ...buildBust(job), digest: digestOf(job) }
  const { recipe, palette } = sitterOf(portraitSettings(job))
  return { ...buildBust(recipe), digest: digestOf(recipe), palette }
}
