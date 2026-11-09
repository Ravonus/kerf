import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { repoRoot } from '../../../scripts/lib/helpers.mjs'

const repo = repoRoot

export function linesOfCode(v) {
  let n = 0
  const count = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) count(p)
      else if (/\.(tsx?|jsx?|mjs|css)$/.test(e.name))
        n += readFileSync(p, 'utf8')
          .split('\n')
          .filter((l) => l.trim()).length
    }
  }
  for (const s of v.src) if (existsSync(join(v.root, s))) count(join(v.root, s))
  return n
}

export const repoState = () => {
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim()
  return {
    commit: process.env.BENCH_COMMIT ?? git('rev-parse', '--short', 'HEAD'),
    dirty: !!git('status', '--porcelain', '--', 'packages', 'crates'),
  }
}
