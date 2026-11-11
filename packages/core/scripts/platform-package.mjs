// One prebuilt compiler addon as the npm package kerf's optionalDependencies name: its package.json carries `os`, `cpu`
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
  const name = `@kerf/compiler-${platform.name}`
  mkdirSync(dir, { recursive: true })
  copyFileSync(binary, join(dir, 'kerf-compiler.node'))
  writeFileSync(join(dir, 'README.md'), platformReadme(name, platform.name))
  const pkg = {
    name,
    version: version(),
    description: `kerf compiler addon for ${platform.name}`,
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/Ravonus/kerf.git',
      directory: 'crates/kerf-compiler',
    },
    homepage: 'https://github.com/Ravonus/kerf/tree/main/packages/core#readme',
    bugs: { url: 'https://github.com/Ravonus/kerf/issues' },
    publishConfig: { access: 'public' },
    main: 'kerf-compiler.node',
    files: ['kerf-compiler.node'],
    os: [platform.os],
    cpu: [platform.cpu],
    ...(platform.libc && { libc: [platform.libc] }),
  }
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  return pkg
}

function platformReadme(name, target) {
  const gh = 'https://github.com/Ravonus/kerf'
  return `<p align="center">
  <a href="${gh}"><img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="72" height="72" alt="Kerf"></a>
</p>

<h1 align="center">${name}</h1>

<p align="center">
  <strong>Kerf's Rust compiler as a native Node addon for ${target}.</strong><br>
  Installed for you by <a href="https://www.npmjs.com/package/@kerf/core">@kerf/core</a>. You never depend on it directly.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/${name}"><img src="https://img.shields.io/npm/v/${name}?color=145c3c&label=npm" alt="npm version"></a>
  <a href="${gh}/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
</p>

## What this is

[@kerf/core](https://www.npmjs.com/package/@kerf/core) lists one of these addons per platform in its
\`optionalDependencies\`. Your package manager installs only the one that matches your OS, CPU and C library, and
core's compiler loader picks it up. When no addon fits, or the one installed is a different version or fails to load,
core runs the same compiler as WebAssembly instead: the output is byte-identical, a little slower to produce.
\`npx kerf doctor\` says which one your app is using.

| Platform           | Package                                |
| ------------------ | -------------------------------------- |
| macOS, Apple silicon | \`@kerf/compiler-darwin-arm64\`     |
| macOS, Intel       | \`@kerf/compiler-darwin-x64\`       |
| Linux x64, glibc   | \`@kerf/compiler-linux-x64-gnu\`    |
| Linux x64, musl    | \`@kerf/compiler-linux-x64-musl\`   |
| Linux arm64, glibc | \`@kerf/compiler-linux-arm64-gnu\`  |
| Linux arm64, musl  | \`@kerf/compiler-linux-arm64-musl\` |
| Windows x64        | \`@kerf/compiler-win32-x64\`        |
| Everything else    | WebAssembly, built into core           |

## Links

- [Compiler source](${gh}/tree/main/crates/kerf-compiler) (Rust, on [Oxc](https://oxc.rs))
- [@kerf/core](https://www.npmjs.com/package/@kerf/core) and [Kerf on GitHub](${gh})
- [Changelog](${gh}/blob/main/CHANGELOG.md) · [Issues](${gh}/issues)

MIT licensed.
`
}
