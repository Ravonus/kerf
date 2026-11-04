// icons() for weft.config.ts. With no tier, every icon carries its three tiers and CSS shows the one for the nearest
// data-expression. `tier` compiles one in: `@weft-js/warp-icons` resolves to that tier alone, warp's own icons included.
import { definePlugin } from '@weft-js/core/plugin'

const TIERS = ['quiet', 'balanced', 'vivid']

function options(input) {
  for (const key of Object.keys(input))
    if (key !== 'tier' && key !== 'source')
      throw Object.assign(new Error(`unknown option \`${key}\``), { path: key })
  if (input.tier !== undefined && !TIERS.includes(input.tier))
    throw Object.assign(new Error(`must be one of ${TIERS.join(', ')}`), { path: 'tier' })
  if (input.source !== undefined && !/^https?:\/\/.+\/$/.test(input.source))
    throw Object.assign(new Error('must be an http(s) URL ending in /'), { path: 'source' })
  return { ...(input.tier && { tier: input.tier }), ...(input.source && { source: input.source }) }
}

const agents =
  'Import icons from `@weft-js/warp-icons`: `CheckIcon` is hollow, the default, `CheckIconSolid` the other form (`<Icon name="check" solid />`); `<Icons.Check />` and warp\'s `<Icon name="check" />` build to the same bytes. Tiers are a prop, `tier`, or the page\'s `data-expression`. Decorative by default; `label` gives one a name. An unknown literal name is I001 at the build and in `weft check`. A name only known at runtime is legal and loads the pack lazily (I002 reports it), or single files with `icons({ source })` and `weft icons publish <dir>`. `trash`, `bell`, `check`, `refresh` and `copy` animate with `action`. `weft docs icons` has the rest.'

/** `icons()` for `weft.config.ts`: pins a tier if asked, and tells agents how the names work. */
export const icons = definePlugin({
  name: '@weft-js/warp-icons',
  version: '0.1.0',
  weft: '*',
  options,
  contribute(o) {
    return {
      tokens: {
        namespace: 'icons',
        values: { tier: o.tier ?? 'runtime' },
        ...((o.tier || o.source) && {
          alias: {
            ...(o.tier && { '@weft-js/warp-icons': `@weft-js/warp-icons/${o.tier}` }),
            ...(o.source && { '@weft-js/warp-icons/source': o.source }),
          },
        }),
      },
      agents: { title: 'Icons', text: agents },
      catalog: [
        {
          name: 'Icon',
          import: '@weft-js/warp-icons/all',
          summary: 'Any icon by name, for names that come from data; costs the whole set',
        },
      ],
      map: [
        {
          want: 'An icon',
          call: 'Import `NameIcon` from `@weft-js/warp-icons`; `npm run sheet` in the package draws them all',
          have: 'one export per icon',
        },
      ],
    }
  },
})

/** `icons()`. */
export default icons
