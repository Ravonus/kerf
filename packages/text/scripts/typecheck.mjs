// tsc over src/. gen/ is machine output (profile reads folded to literals, which tsc calls "comparisons
// that appear unintentional"; stub signatures loosely typed), checked by the tests instead, so its
// diagnostics are counted and not fatal. Any diagnostic outside gen/ fails.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
let out = ''
try {
  execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['--noEmit', '-p', root], {
    encoding: 'utf8',
    cwd: root,
  })
} catch (e) {
  out = e.stdout
}
const lines = out.split('\n').filter((l) => /^\S.*error TS/.test(l))
const ours = lines.filter((l) => !l.startsWith('gen/'))
console.log(
  `tsc: ${ours.length} errors in src/, ${lines.length - ours.length} in generated gen/ (not fatal)`,
)
if (ours.length) {
  console.log(ours.join('\n'))
  process.exit(1)
}
