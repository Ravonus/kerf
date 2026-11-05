// @vitest-environment node
// What a consumer installs: the code, the CSS and what @weft-js/warp's plugin reads, and nothing that only builds or tests it.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const { files } = JSON.parse(
  execFileSync('pnpm', ['--config.ignore-scripts=true', 'pack', '--dry-run', '--json'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
)
const paths = files.map((f) => f.path)

test('every export and what the warp plugin reads ship', () => {
  for (const p of [
    'README.md',
    'package.json',
    'src/index.ts',
    'bindings/weft.ts',
    'styles/warp.css',
    'styles/components/menu.css',
    'scripts/contrast-check.mjs',
    'scripts/contrast-check-colors.mjs',
  ])
    expect(paths).toContain(p)
})

test('tests, build scripts and lockfiles do not', () => {
  expect(paths.filter((p) => /^test\/|\.test\.|^vitest|package-lock|split-css/.test(p))).toEqual([])
})
