import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { walk as walkFiles, repoRoot } from '../../../scripts/lib/helpers.mjs'

const repo = repoRoot

export const sha = (b) => createHash('sha256').update(b).digest('hex')
export const walkBuild = (dir, each) =>
  walkFiles(dir, each, (name) => name === 'cache' || name === 'node_modules' || name === 'server')
/** What this build can legitimately serve: every output file by content, so a served asset either matches or isn't ours. */
export function fingerprint(root, v) {
  const hashes = new Set(),
    newest = []
  for (const d of [...v.stack.out, v.publicDir])
    if (existsSync(join(root, d)))
      walkBuild(join(root, d), (f) => {
        if (/\.(js|mjs|css)$/.test(f)) hashes.add(sha(readFileSync(f)))
        newest.push(f)
      })
  return { hashes, files: newest.length }
}

/** The installed `kerf` has to be the tarball, byte for byte, or the run is measuring some older checkout. */
export function installedIsPacked(root, store) {
  const tarballs = JSON.parse(readFileSync(join(store, 'tarballs.json'), 'utf8')),
    tgz = tarballs.kerf.replace(/^file:/, '')
  const tmp = mkdtempSync(join(tmpdir(), 'bench-tgz-'))
  try {
    execFileSync('tar', ['-xzf', tgz, '-C', tmp])
    let n = 0,
      wrong = []
    walkBuild(join(tmp, 'package'), (f) => {
      const r = relative(join(tmp, 'package'), f),
        i = join(root, 'node_modules/@kerf-js/core', r)
      n++
      if (r !== 'package.json' && (!existsSync(i) || sha(readFileSync(f)) !== sha(readFileSync(i))))
        wrong.push(r)
    })
    if (wrong.length)
      throw new Error(
        `node_modules/@kerf-js/core doesn't match the packed tarball: ${wrong.slice(0, 3).join(', ')}`,
      )
    return { tgz: sha(readFileSync(tgz)).slice(0, 12), files: n }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** Everything this checkout's tarballs are made from: HEAD's trees, plus whatever isn't committed. */
export function kerfInputs() {
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 })
  const h = createHash('sha256')
    .update(git('rev-parse', 'HEAD:packages', 'HEAD:crates'))
    .update(git('diff', 'HEAD', '--', 'packages', 'crates'))
  for (const f of git('ls-files', '-o', '--exclude-standard', '--', 'packages', 'crates')
    .split('\n')
    .filter(Boolean))
    h.update(f).update(readFileSync(join(repo, f)))
  return h.digest('hex')
}
