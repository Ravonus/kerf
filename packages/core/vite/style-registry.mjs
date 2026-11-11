// The definitions and uses collected for the style plugin.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve as resolvePath } from 'node:path'
import { emitGroups, GroupError, resolve as resolveIntent } from '../node/css.mjs'
import { buildMatrix } from '../node/matrix.mjs'
import { transform } from './compiler.mjs'

const EXT = /\.[cm]?[jt]sx?$/
const IMPORTS = /import\s+\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/g

export function defsOf(s, file) {
  const mtime = statSync(file, { throwIfNoEntry: false })?.mtimeMs
  if (mtime === undefined) return []
  if (s.scanned.get(file) !== mtime || !s.defs.has(file)) {
    const code = readFileSync(file, 'utf8')
    const found = code.includes('@kerf/core/style')
      ? transform(code, { filename: file, checkOnly: true }).facts.groups
      : []
    s.defs.set(file, found)
    s.scanned.set(file, mtime)
  }
  return s.defs.get(file)
}

/** The exported groups brought in by one file's relative imports. */
export async function importedGroups(s, ctx, code, id, onDependency, onCandidate) {
  const out = {}
  for (const [, names, spec] of code.matchAll(IMPORTS)) {
    const hit = ctx
      ? await ctx.resolve(spec, id, { skipSelf: true })
      : { id: resolvePath(dirname(id), spec) }
    const file = hit?.id?.replace(/\?.*$/, '')
    if (!file || EXT.test(file)) onCandidate?.(file ?? resolvePath(dirname(id), spec))
    if (!file || !EXT.test(file)) continue
    const found = defsOf(s, file).filter((g) => g.exported)
    if (!found.length) continue
    const key = resolvePath(dirname(id), spec).replace(EXT, '')
    for (const n of names.split(',')) {
      const imported = n
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
      const g = found.find((x) => x.binding === imported)
      if (g) {
        out[`${key}#${imported}`] = { name: g.name, def: g.def }
        onDependency?.(file)
      }
    }
  }
  return out
}

/** Check every group value against the token table and names against the project. */
export function validate(s, ctx, file, groups) {
  for (const g of groups) {
    const where = `${relative(s.root, file)}:${g.line}`
    for (const [other, gs] of s.defs)
      if (other !== file && gs.some((x) => x.name === g.name))
        ctx.error(
          `@kerf/core/style: group ${g.name} (${where}) is also defined in ${relative(s.root, other)}`,
        )
    const { base, axes = {}, parts = {}, states = {}, compounds = [] } = g.def
    try {
      resolveIntent(base ?? {}, `group ${g.name} (${where}) base`)
      for (const [axis, vals] of Object.entries(axes))
        if (vals !== 'inherit')
          for (const [v, i] of Object.entries(vals))
            resolveIntent(i, `group ${g.name} (${where}) ${axis}=${v}`)
      for (const [k, i] of Object.entries({ ...parts, ...states }))
        resolveIntent(i, `group ${g.name} (${where}) ${k}`)
      for (const [n, c] of compounds.entries())
        resolveIntent(c.set, `group ${g.name} (${where}) compound ${n}`)
    } catch (e) {
      if (e instanceof GroupError) ctx.error(`D025 @kerf/core/style: ${e.message}`)
      throw e
    }
  }
}

const sources = (s) => ({
  all: [...s.defs].flatMap(([file, gs]) =>
    gs.map((g) => ({ ...g, file: relative(s.root, file).split('\\').join('/') })),
  ),
  used: [...s.uses].flatMap(([file, us]) =>
    us.map((u) => ({ ...u, file: relative(s.root, file).split('\\').join('/') })),
  ),
})

export function css(s) {
  const { all, used } = sources(s)
  return emitGroups(all, used, { dev: s.isDev, taggedParts: s.taggedParts })
}

/** Write the matrix only when it changed. */
export function writeMatrix(s) {
  const { all, used } = sources(s)
  const m = buildMatrix(all, used)
  const text = `${JSON.stringify(m, null, 2)}\n`
  if (
    s.matrix &&
    text !== s.written &&
    (all.length || existsSync(join(s.root, '.kerf', 'styles.json')))
  ) {
    try {
      mkdirSync(join(s.root, '.kerf'), { recursive: true })
      writeFileSync(join(s.root, '.kerf', 'styles.json'), text)
      s.written = text
    } catch {}
  }
  return m
}
