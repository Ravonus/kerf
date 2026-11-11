// icons() for kerf.config.ts. With no tier, every icon carries its three tiers and CSS shows the one for the nearest
// data-expression. `tier` compiles one in: `@kerf-js/veneer-icons` resolves to that tier alone, veneer's own icons included.
import { definePlugin } from '@kerf-js/core/plugin'

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
  'Import icons from `@kerf-js/veneer-icons`: `CheckIcon` is hollow, the default, `CheckIconSolid` the other form (`<Icon name="check" solid />`); `<Icons.Check />` and veneer\'s `<Icon name="check" />` build to the same bytes. Tiers are a prop, `tier`, or the page\'s `data-expression`. Decorative by default; `label` gives one a name. An unknown literal name is I001 at the build and in `kerf check`. A name only known at runtime is legal and loads the pack lazily (I002 reports it), or single files with `icons({ source })` and `kerf icons publish <dir>`. `trash`, `bell`, `check`, `refresh` and `copy` animate with `action`. `kerf docs icons` has the rest.'

/** `icons()` for `kerf.config.ts`: pins a tier if asked, and tells agents how the names work. */
export const icons = definePlugin({
  name: '@kerf-js/veneer-icons',
  version: '0.1.0',
  kerf: '*',
  options,
  contribute(o) {
    return {
      tokens: {
        namespace: 'icons',
        values: { tier: o.tier ?? 'runtime' },
        ...((o.tier || o.source) && {
          alias: {
            ...(o.tier && { '@kerf-js/veneer-icons': `@kerf-js/veneer-icons/${o.tier}` }),
            ...(o.source && { '@kerf-js/veneer-icons/source': o.source }),
          },
        }),
      },
      agents: { title: 'Icons', text: agents },
      catalog: [
        {
          name: 'Icon',
          import: '@kerf-js/veneer-icons/all',
          summary: 'Any icon by name, for names that come from data; costs the whole set',
        },
      ],
      map: [
        {
          want: 'An icon',
          call: 'Import `NameIcon` from `@kerf-js/veneer-icons`; `npm run sheet` in the package draws them all',
          have: 'one export per icon',
        },
      ],
    }
  },
})

/** `icons()`. */
export default icons
