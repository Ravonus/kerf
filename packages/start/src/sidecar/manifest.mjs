import { renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isNative } from './common.mjs'

export function publisher(states, nativeDir, contract) {
  /** What the server's `native()` reads on each call: one rename, so it never sees half of it. */
  return () => {
    const manifest = Object.fromEntries(
      [...states]
        .filter(([k]) => isNative(contract(), k))
        .map(([k, s]) => [
          k,
          s.loaded ?? { hash: '', failure: s.failure ?? `\`${k}\` hasn't built` },
        ]),
    )
    writeFileSync(join(nativeDir, 'manifest.tmp'), JSON.stringify(manifest))
    renameSync(join(nativeDir, 'manifest.tmp'), join(nativeDir, 'manifest.json'))
  }
}
