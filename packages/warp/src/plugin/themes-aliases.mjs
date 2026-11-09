import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Resolve token and themed stylesheet aliases against the app and package roots. */
export function themeAliases(options, env, core) {
  return {
    ...(options.namedColors && {
      '@weft-js/warp/tailwind.css': join(resolve(env.root), '.weft/tokens/warp.tailwind.css'),
    }),
    ...((options.buttonCandidate || options.systemInputs || options.partInputs) &&
      Object.fromEntries(
        [
          'warp.css',
          'components/button.css',
          'components/nav.css',
          'components/tabs.css',
          'components/link.css',
          'components/pill.css',
          'data/card.css',
        ].map((path) => [
          `@weft-js/warp-core/styles/${path}`,
          fileURLToPath(new URL(`styles/themed/${path}`, core)),
        ]),
      )),
  }
}

/** Emit inherited configured inputs without adding an empty layer. */
export function inheritedInputs(options) {
  return [options.systemInputs, options.partInputs]
    .filter(Boolean)
    .map((value) => `@layer warp.tokens{:root{${value}}}\n`)
    .join('')
}

/** Render the non-palette dial selectors. */
export function dialInputs(options, render) {
  return Object.entries(options.dials ?? {})
    .filter(([dial]) => dial !== 'palette')
    .map(([dial, value]) => render(dial, value))
    .join('')
}
