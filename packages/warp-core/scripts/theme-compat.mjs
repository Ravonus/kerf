// Compare every tracked legacy CSS output and entry against a named Git baseline.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lowerTheme, themeNames } from './theme-css.mjs'

const baseline = process.argv[process.argv.indexOf('--baseline') + 1]
if (!process.argv.includes('--baseline') || !baseline || baseline.startsWith('--')) {
  console.error('Pass --baseline <git-ref>')
  process.exit(1)
}
const paths = [
  'packages/warp-core/styles',
  'packages/warp/src/links.css',
  'packages/warp/src/type.css',
  'packages/warp/src/layout.css',
  'packages/warp/tailwind.css',
]
const git = (args) => execFileSync('git', args, { encoding: 'utf8' })
const baselinePaths = git(['ls-tree', '-r', '--name-only', baseline, '--', ...paths])
  .trim()
  .split('\n')
  .filter((path) => path && !path.startsWith('packages/warp-core/styles/themed/'))
const tracked = git(['ls-files', '--', ...paths])
  .trim()
  .split('\n')
  .filter(Boolean)
if (!baselinePaths.length) throw new Error(`No files in baseline ${baseline}`)
const themed = tracked.filter((path) => path.startsWith('packages/warp-core/styles/themed/'))
const legacy = tracked.filter((path) => !themed.includes(path))
const expected = new Set(baselinePaths)
const current = new Set(legacy)
const errors = []
for (const path of baselinePaths)
  if (!current.has(path)) errors.push(`Missing tracked file: ${path}`)
for (const path of legacy) if (!expected.has(path)) errors.push(`Extra legacy file: ${path}`)
const styleRoot = 'packages/warp-core/styles'
const disk = readdirSync(styleRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name))
for (const path of disk) {
  if (!tracked.includes(path)) errors.push(`Untracked style file: ${path}`)
}
for (const path of themed) {
  const legacyPath = path.replace('/styles/themed/', '/styles/')
  if (!current.has(legacyPath)) {
    errors.push(`Missing legacy counterpart: ${legacyPath}`)
    continue
  }
  try {
    const source = readFileSync(path, 'utf8')
    const candidate = process.argv.includes('--negative-themed') ? `${source}x` : source
    const lowered = lowerTheme(candidate, themeNames)
    if (lowered !== readFileSync(legacyPath, 'utf8'))
      errors.push(`Themed lowering differs: ${path}`)
  } catch (error) {
    errors.push(`Themed lowering failed: ${path}: ${error.message}`)
  }
}
let checked = 0
const negative = process.argv.includes('--negative-control')
let temporary
try {
  if (negative) temporary = mkdtempSync(join(tmpdir(), 'warp-compat-'))
  for (const path of baselinePaths) {
    if (!current.has(path)) continue
    const original = execFileSync('git', ['show', `${baseline}:${path}`])
    let candidate
    try {
      candidate = readFileSync(path)
    } catch {
      errors.push(`Missing file: ${path}`)
      continue
    }
    if (negative && checked === 0) {
      const file = join(temporary, 'changed')
      writeFileSync(file, Buffer.concat([candidate, Buffer.from('x')]))
      candidate = readFileSync(file)
    }
    checked++
    if (!original.equals(candidate)) errors.push(`Changed: ${path}`)
  }
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true })
}
console.log(
  `Legacy files: ${checked}/${baselinePaths.length} checked, ${legacy.length} tracked; themed: ${themed.length}`,
)
if (themed.length) console.log(`Themed additions: ${themed.join(', ')}`)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
