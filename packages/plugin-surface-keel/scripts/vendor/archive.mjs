// Stage only the pinned source used by the vendor bundles, without changing the KEEL checkout.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const PIN = '4bcccc7faee50bdf5abcfd858a19dd0ad1ed736a'
const PACKAGES = ['core', 'render', 'react', 'ui', 'codec']
const INPUTS = [
  'LICENSE',
  'package.json',
  'tsconfig.json',
  'tsconfig.base.json',
  ...PACKAGES.flatMap((name) => [`packages/${name}/src`, `packages/${name}/package.json`]),
]

export function stageSource(repo) {
  const found = execFileSync('git', ['-C', repo, 'rev-parse', `${PIN}^{commit}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  if (found !== PIN) throw new Error(`Expected pinned KEEL commit ${PIN}; got ${found}`)
  const dir = mkdtempSync(join(tmpdir(), 'weft-keel-vendor-'))
  try {
    const archive = execFileSync('git', ['-C', repo, 'archive', PIN, ...INPUTS], {
      maxBuffer: 32 * 1024 * 1024,
    })
    execFileSync('tar', ['-x', '-C', dir], { input: archive })
    const modules = join(dir, 'node_modules', '@keel-engine')
    mkdirSync(modules, { recursive: true })
    for (const name of PACKAGES)
      symlinkSync(join(dir, 'packages', name), join(modules, name), 'dir')
    return dir
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
}
