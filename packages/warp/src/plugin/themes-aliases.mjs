import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function themedSheets(core, dir = '') {
  return readdirSync(new URL(`styles/themed/${dir}`, core), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? themedSheets(core, `${dir}${entry.name}/`)
        : entry.name.endsWith('.css')
          ? [`${dir}${entry.name}`]
          : [],
    )
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Resolve token and themed stylesheet aliases against the app and package roots. */
export function themeAliases(options, env, core) {
  return {
    ...(options.namedColors && {
      '@weft-js/warp/tailwind.css': join(resolve(env.root), '.weft/tokens/warp.tailwind.css'),
    }),
    ...((options.buttonCandidate || options.systemInputs || options.partInputs) &&
      Object.fromEntries(
        themedSheets(core).map((path) => [
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
