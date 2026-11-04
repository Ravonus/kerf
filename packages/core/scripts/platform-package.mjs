// One prebuilt compiler addon as the npm package weft's optionalDependencies name: its package.json carries `os`, `cpu`
// and `libc`, so the installer keeps only the one that fits.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { forHost } = require('../platforms.cjs')
const version = () =>
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

/** The table's entry for this machine. Node's report names glibc; a musl Node doesn't have that field. */
export function hostPlatform() {
  const fits = forHost()
  if (process.platform !== 'linux') return fits[0]
  const libc = process.report.getReport().header.glibcVersionRuntime ? 'glibc' : 'musl'
  return fits.find((p) => p.libc === libc)
}

export function writePlatformPackage(platform, binary, dir) {
  const name = `@weft-js/compiler-${platform.name}`
  mkdirSync(dir, { recursive: true })
  copyFileSync(binary, join(dir, 'weft-compiler.node'))
  writeFileSync(
    join(dir, 'README.md'),
    `# ${name}\n\nThe weft compiler as a Node addon for ${platform.name}. @weft-js/core installs it by itself where it fits and runs its WASM build where it doesn't: same output, a little slower. Don't depend on this directly.\n`,
  )
  const pkg = {
    name,
    version: version(),
    description: `weft compiler addon for ${platform.name}`,
    license: 'MIT',
    publishConfig: { access: 'public' },
    main: 'weft-compiler.node',
    files: ['weft-compiler.node'],
    os: [platform.os],
    cpu: [platform.cpu],
    ...(platform.libc && { libc: [platform.libc] }),
  }
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  return pkg
}
