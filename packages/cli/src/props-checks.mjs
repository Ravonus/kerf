// Prop inference in `weft check` and `weft tsc` (research 44). `W080`–`W085` come from the engine; a `TS` code is the
// compiler's own error, reported at the source position with the inferred types applied.

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { diagnostic, positions } from './diag.mjs'

const require = createRequire(import.meta.url)
const { Session } = require('./infer/session.cjs')

const posix = p => p.split('\\').join('/')

export function toDiagnostics(root, list, file) {
  const rel = posix(relative(root, file))
  const text = readFileSync(file, 'utf8')
  const pos = positions(text)
  return list.map(f => diagnostic({
    code: f.code, severity: f.severity, file: rel, span: pos.span(f.start, f.end), offset: [f.start, f.end], why: f.why, help: f.help,
    fix: f.edits && { description: f.help, safe: f.safe, edits: f.edits.map(e => ({ file: rel, span: pos.span(e.start, e.end), offset: [e.start, e.end], text: e.text })) },
  }))
}

/** The checks `weft check` adds. A project with nothing to infer parses its `.tsx` files once and starts nothing. */
export async function propChecks(root, config) {
  if (config.check?.props === false || !existsSync(join(root, 'tsconfig.json'))) return []
  const session = new Session(ts, root)
  try {
    const { findings, errors } = await session.analyze()
    return [...findings, ...errors].flatMap(([file, list]) => toDiagnostics(root, list, file))
  } finally {
    session.close()
  }
}

/** `weft tsc`: the whole project, as `tsc --noEmit` sees it with inference applied. */
export async function propTsc(root) {
  const session = new Session(ts, root)
  try {
    const { findings, errors } = await session.all()
    return [...findings, ...errors].flatMap(([file, list]) => toDiagnostics(root, list, file))
  } finally {
    session.close()
  }
}
