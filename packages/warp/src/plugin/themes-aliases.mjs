import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Resolve token and themed stylesheet aliases against the app and package roots. */
export function themeAliases(options, env, core) {
  return {
    ...(options.namedColors && {
      '@weft-js/warp/tailwind.css': join(resolve(env.root), '.weft/tokens/warp.tailwind.css'),
    }),
    ...(options.buttonCandidate && {
      '@weft-js/warp-core/styles/warp.css': fileURLToPath(new URL('styles/themed/warp.css', core)),
      '@weft-js/warp-core/styles/components/button.css': fileURLToPath(
        new URL('styles/themed/components/button.css', core),
      ),
    }),
  }
}
