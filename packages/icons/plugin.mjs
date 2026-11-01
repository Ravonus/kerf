// icons() for weft.config.ts. With no tier, every icon carries its three tiers and CSS shows the one for the nearest
// data-expression. `tier` compiles one in: `@weft/icons` resolves to that tier alone, warp's own icons included.
import { definePlugin } from 'weft/plugin'

const TIERS = ['quiet', 'balanced', 'vivid']

function options(input) {
  for (const key of Object.keys(input)) if (key !== 'tier' && key !== 'source') throw Object.assign(new Error(`unknown option \`${key}\``), { path: key })
  if (input.tier !== undefined && !TIERS.includes(input.tier)) throw Object.assign(new Error(`must be one of ${TIERS.join(', ')}`), { path: 'tier' })
  if (input.source !== undefined && !/^https?:\/\/.+\/$/.test(input.source)) throw Object.assign(new Error('must be an http(s) URL ending in /'), { path: 'source' })
  return { ...(input.tier && { tier: input.tier }), ...(input.source && { source: input.source }) }
}

const agents = "Import icons from `@weft/icons`: `CheckIcon`, `CheckIconHollow`, `CheckIconSolid`, `CheckIconDither`; `<Icons.Check />` and warp's `<Icon name=\"check\" />` build to the same bytes. Tiers are a prop, `tier`, or the page's `data-expression`. Decorative by default; `label` gives one a name. An unknown literal name is I001 at the build and in `weft check`. A name only known at runtime is legal and loads the pack lazily (I002 reports it), or single files with `icons({ source })` and `weft icons publish <dir>`. `trash`, `bell`, `check`, `refresh` and `copy` animate with `action`. `weft docs icons` has the rest."

export const icons = definePlugin({
  name: '@weft/icons',
  version: '0.0.0',
  weft: '*',
  options,
  contribute(o) {
    return {
      tokens: { namespace: 'icons', values: { tier: o.tier ?? 'runtime' }, ...((o.tier || o.source) && { alias: { ...(o.tier && { '@weft/icons': `@weft/icons/${o.tier}` }), ...(o.source && { '@weft/icons/source': o.source }) } }) },
      agents: { title: 'Icons', text: agents },
      catalog: [{ name: 'Icon', import: '@weft/icons/all', summary: 'Any icon by name, for names that come from data; costs the whole set' }],
      map: [{ want: 'An icon', call: 'Import `NameIcon` from `@weft/icons`; `npm run sheet` in the package draws them all', have: 'one export per icon' }],
    }
  },
})

export default icons
