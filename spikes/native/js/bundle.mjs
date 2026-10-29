// One bundle per platform, with `__WEFT_OS__` folded in so each phone only ships its own branches.
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const js = dirname(fileURLToPath(import.meta.url))
for (const os of ['ios', 'android']) {
  await build({
    entryPoints: [join(js, 'src/entry.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    define: { __WEFT_OS__: JSON.stringify(os) },
    outfile: join(js, `dist/${os}/app.js`),
    logLevel: 'warning',
  })
}
console.log('bundled dist/ios/app.js, dist/android/app.js')
