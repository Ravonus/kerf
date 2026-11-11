// Browser code calls nothing a page on plain http lacks. `crypto.randomUUID` is only there in a secure context (https or
// localhost): opened at a LAN address, the call throws, and one made on load once took a whole page down. Follows the same
// import graph as boundaries.mjs, from every browser entry of the packages and from the site's client code.
//
//   node scripts/quality/browser-apis.mjs [--json] [files…]   files: scan these too, as browser code
import { repoRoot } from '../lib/helpers.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BROWSER, entry, trail, walk } from './boundaries.mjs'

const root = repoRoot
// A call on a line that also tests `typeof … randomUUID` is the fallback pattern (veneer-core's newOrderKey), and allowed.
const CALL = /\brandomUUID\s*\(/
const GUARDED = /typeof\s+[\w.]*randomUUID\b/
// Server modules run only on the server; a client build gets a stub of them.
const server = (f) =>
  /(?:^|\/)site\/src\/server\/|\.server\.[cm]?[jt]sx?$|\.og\.[jt]sx?$/.test(f.split('\\').join('/'))

/** Every `randomUUID(` call in `file` that isn't behind a `typeof` test, as `{ line, text }`. */
function calls(file) {
  const lines = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
  return lines.flatMap((text, i) =>
    CALL.test(text.replace(/\/\/.*$/, '')) && !GUARDED.test(text)
      ? [{ line: i + 1, text: text.trim() }]
      : [],
  )
}

/** The site's client code: its source, without the modules only its server runs. */
function siteFiles() {
  const src = join(root, 'site', 'src')
  if (!existsSync(src)) return []
  return readdirSync(src, { recursive: true })
    .map(String)
    .map((f) => join(src, f))
    .filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !f.endsWith('.d.ts') && !server(f))
}

/** Every unguarded `randomUUID()` browser code reaches, as `{ file, detail, fix }`. */
export function findProblems(extra = []) {
  const reached = new Map() // file → the chain that reaches it
  const follow = (start, skip) => {
    const seen = walk(start, () => {}, skip)
    for (const file of seen.keys())
      if (!reached.has(file) && /\.[cm]?[jt]sx?$/.test(file)) reached.set(file, trail(seen, file))
  }
  for (const [dir, subs] of Object.entries(BROWSER))
    for (const sub of subs) {
      const f = entry(dir, sub)
      if (f && existsSync(f)) follow(f, server)
    }
  // The site's own files only: a package it imports is the package's browser entries above. Its `.` entry also exports
  // server code, which a client build shakes out but a walk of the imports can't.
  const site = join(root, 'site') + sep
  for (const f of [...siteFiles(), ...extra.map((x) => resolve(x))])
    follow(f, (n) => server(n) || (f.startsWith(site) && !n.startsWith(site)))
  const problems = []
  for (const [file, chain] of reached) {
    for (const c of calls(file))
      problems.push({
        file: `${relative(root, file)}:${c.line}`,
        detail: `\`${c.text}\` runs in the browser (${chain}), and a page on plain http has no crypto.randomUUID`,
        fix: "Use crypto.getRandomValues, or test `typeof crypto.randomUUID === 'function'` first (veneer-core's newOrderKey does).",
      })
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = findProblems(process.argv.slice(2).filter((a) => !a.startsWith('--')))
  if (process.argv.includes('--json')) console.log(JSON.stringify(problems))
  else for (const p of problems) console.log(`${p.file}: ${p.detail}\n  fix: ${p.fix}`)
  process.exit(problems.length ? 1 : 0)
}
