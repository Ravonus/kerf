// Rules a diff can't show: they're about the commits on a branch.
//
//   node scripts/quality/commits.mjs [--base <ref>] [--dco]
//
// A commit that fixes a bug touches a test, or says why it can't in a `No-Regression-Test: <reason>` trailer.
// --dco also wants a `Signed-off-by:` on every commit: CI asks that of pull requests.
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { values } = parseArgs({ options: { base: { type: 'string' }, dco: { type: 'boolean' } } })
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
const has = ref => spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: root }).status === 0
const base = values.base ?? ['@{upstream}', 'origin/main', 'main'].find(has)
if (!base) { console.log('no base branch here: nothing to compare'); process.exit(0) }

const FIX = /\b(?:fix(?:es|ed)?|bug|regression|crash(?:es|ed)?|broke(?:n)?|leak(?:s|ed)?)\b/i
const SOURCE = /^(?:packages\/[^/]+\/(?:src|bin|bindings|plugin|node)\/|crates\/[^/]+\/src\/)/
const TEST = /(?:^|\/)(?:test|tests)\/|\.(?:test|spec)\.|(?:^|\/)evals\//
// The last commit before these rules existed: history up to it was written under no rule, and stays as it was.
const BEFORE_RULES = 'fa5dae8842ab67389ca9f2b971995fcad0fbee16'
const problems = []
const range = [`${git('merge-base', base, 'HEAD').trim()}..HEAD`, ...(has(BEFORE_RULES) ? [`^${BEFORE_RULES}`] : [])]
for (const sha of git('rev-list', '--no-merges', ...range).split('\n').filter(Boolean)) {
  const message = git('show', '-s', '--format=%B', sha)
  const subject = message.split('\n')[0]
  const files = git('show', '--format=', '--name-only', sha).split('\n').filter(Boolean)
  if (FIX.test(subject) && files.some(f => SOURCE.test(f)) && !files.some(f => TEST.test(f)) && !/^No-Regression-Test: \S.{7,}/m.test(message)) problems.push(`${sha.slice(0, 7)} "${subject.slice(0, 70)}" fixes a bug with no test. Add a test that fails without the fix, or a \`No-Regression-Test: <reason>\` trailer.`)
  if (values.dco && !/^Signed-off-by: \S.* <\S+@\S+>$/m.test(message)) problems.push(`${sha.slice(0, 7)} has no Signed-off-by. Commit with \`git commit -s\`; to sign what's there, \`git rebase --signoff ${base}\`.`)
}
for (const line of problems) console.log(line)
process.exit(problems.length ? 1 : 0)
