// Scratch copies of a project for the gate, and vitest runs in them. A copy lives in `<root>/.kerf/gate/<id>`, so
// node_modules hoisted above the project still resolve; the project's own node_modules dirs are symlinked, not copied.

import { spawn } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'

const skipDirs = new Set(['.git', '.kerf', 'dist', 'coverage', '.turbo', 'target'])

/**
 * Copy `root` into a new scratch dir. `exclude(rel)` leaves a path out (relative to root, posix).
 * @returns {string} the copy's real path
 */
export function copyProject(
  root,
  { exclude = () => false, id = Math.random().toString(36).slice(2, 8) } = {},
) {
  const dest = join(root, '.kerf', 'gate', `${process.pid}-${id}`)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  const go = (from, to, rel) => {
    for (const e of readdirSync(from, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      const src = join(from, e.name)
      if (e.name === 'node_modules') {
        symlinkSync(realpathSync(src), join(to, e.name))
        continue
      }
      if (exclude(r)) continue
      if (e.isDirectory()) {
        if (skipDirs.has(e.name)) continue
        mkdirSync(join(to, e.name))
        go(src, join(to, e.name), r)
      } else if (e.isFile()) copyFileSync(src, join(to, e.name))
      else if (e.isSymbolicLink()) {
        try {
          symlinkSync(realpathSync(src), join(to, e.name))
        } catch {}
      }
    }
  }
  go(root, dest, '')
  return realpathSync(dest)
}

/** Write (or with `null`, delete) files in a copy. */
export function writeFiles(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(dir, rel)
    if (text == null) rmSync(abs, { force: true })
    else {
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, text)
    }
  }
}

export function removeCopy(dir) {
  rmSync(dir, { recursive: true, force: true })
  // Leave `.kerf/gate` behind only when something else is in it.
  const gateDir = dirname(dir)
  try {
    if (!readdirSync(gateDir).length) rmSync(gateDir, { recursive: true })
  } catch {}
}

/** The vitest CLI the project would run: its own, else the CLI's. */
export function vitestBin(root) {
  for (const req of [createRequire(join(root, 'package.json')), createRequire(import.meta.url)]) {
    try {
      let dir = dirname(req.resolve('vitest'))
      while (
        !existsSync(join(dir, 'package.json')) ||
        !/"name":\s*"vitest"/.test(readFileSync(join(dir, 'package.json'), 'utf8'))
      ) {
        if (dirname(dir) === dir) throw new Error('no vitest')
        dir = dirname(dir)
      }
      return join(dir, 'vitest.mjs')
    } catch {}
  }
  throw Object.assign(new Error('vitest is not installed in this project'), { code: 'E_NO_VITEST' })
}

/**
 * Run vitest on `files` (relative to `dir`) and read its JSON report.
 * @returns {Promise<{ tests: Map<string, { status: string, message?: string }>, loadErrors: Map<string, string>, timedOut: boolean, ms: number, stderr: string }>}
 *   `tests` is keyed `<file>::<suite > test>`; `loadErrors` by file, for files that failed before running a test.
 */
export function runVitest(dir, files, { bin, timeoutMs = 120_000, config } = {}) {
  const report = join(dir, `.kerf-report-${Math.random().toString(36).slice(2, 8)}.json`)
  const args = [
    bin,
    'run',
    '--root',
    dir,
    '--reporter=json',
    `--outputFile=${report}`,
    '--passWithNoTests',
    ...(config ? ['--config', config] : []),
    ...files,
  ]
  const started = performance.now()
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: dir,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
      detached: true,
    })
    let stderr = ''
    child.stderr.on('data', (d) => {
      if (stderr.length < 20_000) stderr += d
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
      } catch {}
    }, timeoutMs)
    child.on('close', () => {
      clearTimeout(timer)
      const tests = new Map(),
        loadErrors = new Map()
      if (!timedOut && existsSync(report)) {
        let data
        try {
          data = JSON.parse(readFileSync(report, 'utf8'))
        } catch {}
        rmSync(report, { force: true })
        for (const f of data?.testResults ?? []) {
          const file = relative(dir, safeReal(f.name)).split('\\').join('/')
          if (!f.assertionResults.length) {
            loadErrors.set(file, firstLine(f.message) || 'the file failed to load')
            continue
          }
          for (const a of f.assertionResults)
            tests.set(`${file}::${[...a.ancestorTitles, a.title].join(' > ')}`, {
              status: a.status,
              message: firstLine(a.failureMessages?.[0]),
            })
        }
      }
      resolve({ tests, loadErrors, timedOut, ms: Math.round(performance.now() - started), stderr })
    })
  })
}

const safeReal = (p) => {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}
const firstLine = (s) =>
  s
    ?.split('\n')
    .find((l) => l.trim())
    ?.trim()
    .slice(0, 300)

export const isDir = (p) => {
  try {
    return lstatSync(p).isDirectory()
  } catch {
    return false
  }
}
