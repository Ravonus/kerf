// icons() for weft.config.ts. With no tier, every icon carries its three tiers and CSS shows the one for the nearest
// data-expression. `tier` compiles one in: `@weft/icons` resolves to that tier alone, warp's own icons included.
import { definePlugin } from 'weft/plugin'

const TIERS = ['quiet', 'balanced', 'vivid']

function options(input) {
  for (const key of Object.keys(input)) if (key !== 'tier') throw Object.assign(new Error(`unknown option \`${key}\``), { path: key })
  if (input.tier !== undefined && !TIERS.includes(input.tier)) throw Object.assign(new Error(`must be one of ${TIERS.join(', ')}`), { path: 'tier' })
  return input.tier ? { tier: input.tier } : {}
}

const agents = "Import per-icon components from `@weft/icons` (`IconCheck`); an unused one costs nothing. Decorative by default; `label` gives one a name. `iconSet({ check: IconCheck })` makes a `<Icon name>` over those; `@weft/icons/all` is that over all of them, and pays for all of them. Outline at quiet and balanced, pixel art at vivid, following `data-expression` with no script. `icons({ tier: 'vivid' })` ships that tier alone. `weft docs icons` has the rest."

export const icons = definePlugin({
  name: '@weft/icons',
  version: '0.0.0',
  weft: '*',
  options,
  contribute(o) {
    return {
      tokens: { namespace: 'icons', values: { tier: o.tier ?? 'runtime' }, ...(o.tier && { alias: { '@weft/icons': `@weft/icons/${o.tier}` } }) },
      agents: { title: 'Icons', text: agents },
      catalog: [{ name: 'Icon', import: '@weft/icons/all', summary: 'Any icon by name, for names that come from data; costs the whole set' }],
      map: [{ want: 'An icon', call: 'Import `IconName` from `@weft/icons`; `weft docs icons` lists them', have: 'one export per icon' }],
    }
  },
})

export default icons
