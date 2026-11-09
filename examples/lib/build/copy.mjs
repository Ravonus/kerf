import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Never copied: a real env file or anything else that can hold a credential, and any build or dependency folder.
export const SECRET =
  /(^|\/)(\.env(\.(?!example$)[^/]*)?|netlify\.env|\.neon|\.mcp\.json|[^/]*\.pem)$/
export const SKIP =
  /(^|\/)(\._[^/]*|node_modules|\.git|\.next|\.output|\.vinxi|\.nitro|\.netlify|\.vercel|\.claude|dist)(\/|$)/

export function files(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'ls-files', '-co', '--exclude-standard'], {
      encoding: 'utf8',
      maxBuffer: 1 << 26,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean)
  } catch {
    const out = [],
      walk = (d) => {
        for (const e of readdirSync(join(dir, d))) {
          const r = d ? `${d}/${e}` : e
          if (SKIP.test(r)) continue
          lstatSync(join(dir, r)).isDirectory() ? walk(r) : out.push(r)
        }
      }
    walk('')
    return out
  }
}

/** The work folder gets exactly the source: leftovers go, only node_modules stays for a faster install. */
export function copy(v, to) {
  mkdirSync(to, { recursive: true })
  const clear = (d, keep) => {
    for (const e of readdirSync(d)) {
      if (keep(e)) continue
      rmSync(join(d, e), { recursive: true, force: true })
    }
  }
  clear(to, (e) => e === 'node_modules' || e === v.cwd.split('/')[0])
  if (v.cwd !== '.') {
    mkdirSync(join(to, v.cwd), { recursive: true })
    clear(join(to, v.cwd), (e) => e === 'node_modules')
  }
  let n = 0
  for (const f of files(v.path)) {
    if (SECRET.test(f) || SKIP.test(f) || !existsSync(join(v.path, f))) continue
    mkdirSync(dirname(join(to, f)), { recursive: true })
    copyFileSync(join(v.path, f), join(to, f))
    n++
  }
  return n
}
