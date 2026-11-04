import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { parse, valueNames, pruneImports } from './syntax.mjs'

// ---- server modules (research 27 §2) ------------------------------------------------------------------------------

/** `src/server/**` and `*.server.ts(x)`: files whose `query`/`mutation` exports become client stubs. */
export const isServerModule = (rel) =>
  rel.startsWith('src/server/') || /\.server\.[cm]?[jt]sx?$/.test(rel)

export function scanServerModules(root) {
  const out = []
  const walk = (dir) => {
    let list
    try {
      list = readdirSync(join(root, dir), { withFileTypes: true })
    } catch {
      return
    }
    for (const d of list) {
      const rel = `${dir}/${d.name}`
      if (d.isDirectory()) {
        if (d.name !== 'node_modules' && !d.name.startsWith('.')) walk(rel)
      } else if (
        /\.[cm]?[jt]sx?$/.test(d.name) &&
        !/\.(test|spec)\./.test(d.name) &&
        !d.name.endsWith('.d.ts') &&
        isServerModule(rel)
      )
        out.push(rel)
    }
  }
  walk('src')
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

const FN_KINDS = new Set(['query', 'mutation', 'stream', 'topic', 'channel', 'sharedState'])

/** Local names bound to the `FN_KINDS` from @weft-js/start. */
function fnLocals(ast) {
  const locals = new Map()
  for (const n of ast.program.body) {
    if (
      n.type !== 'ImportDeclaration' ||
      n.importKind === 'type' ||
      !/^@weft-js\/start(\/data)?$/.test(n.source.value)
    )
      continue
    for (const s of n.specifiers)
      if (
        s.type === 'ImportSpecifier' &&
        s.importKind !== 'type' &&
        FN_KINDS.has(s.imported.name ?? s.imported.value)
      )
        locals.set(s.local.name, s.imported.name ?? s.imported.value)
  }
  return locals
}

/** `export const name = query({ … })` statements: the call, its options object and the export name. */
function fnExports(ast, locals) {
  const out = []
  for (const n of ast.program.body) {
    if (n.type !== 'ExportNamedDeclaration' || n.declaration?.type !== 'VariableDeclaration')
      continue
    for (const d of n.declaration.declarations) {
      const call =
        d.init?.type === 'CallExpression'
          ? d.init
          : d.init?.type === 'TSAsExpression' || d.init?.type === 'TSSatisfiesExpression'
            ? d.init.expression
            : undefined
      if (
        call?.type !== 'CallExpression' ||
        call.callee.type !== 'Identifier' ||
        !locals.has(call.callee.name)
      )
        continue
      const obj = call.arguments[locals.get(call.callee.name) === 'sharedState' ? 1 : 0] // `sharedState(name, { … })`
      if (obj?.type !== 'ObjectExpression' || d.id.type !== 'Identifier') continue
      out.push({
        node: n,
        name: d.id.name,
        callee: call.callee.name,
        obj,
        single: n.declaration.declarations.length === 1,
      })
    }
  }
  return out
}

const prop = (obj, key) =>
  obj.properties.find(
    (p) => p.type === 'Property' && !p.computed && (p.key.name ?? p.key.value) === key,
  )
/** A function's id: its name and a hash of its file, stable across builds. */
export const fnId = (name, rel) =>
  `${name}.${createHash('sha256').update(rel).digest('hex').slice(0, 6)}`

/** The server build of a server module: each definition gets its `$id`. Exported for tests. */
export function withIds(code, file, rel) {
  const ast = parse(file, code)
  const locals = fnLocals(ast)
  const all = fnExports(ast, locals)
  for (const f of all) {
    const kind = locals.get(f.callee)
    if ((kind === 'channel' || kind === 'sharedState') && !prop(f.obj, 'authorize')) {
      const line = code.slice(0, f.obj.start).split('\n').length
      throw Object.assign(
        new Error(
          `R001: ${rel}:${line} \`${f.name}\` has no \`authorize\`: anyone could join it.\n  fix: add \`authorize\` (\`() => true\` must be written out)`,
        ),
        { code: 'R001' },
      )
    }
  }
  const list = all.filter((f) => !prop(f.obj, '$id'))
  let out = code
  for (const f of list.sort((a, b) => b.obj.start - a.obj.start))
    out =
      out.slice(0, f.obj.start + 1) +
      ` $id: ${JSON.stringify(fnId(f.name, rel))},` +
      out.slice(f.obj.start + 1)
  return out
}

/**
 * The client build of a server module: stubs (`query({ $id, shape })`, `mutation({ $id, optimistic })`), the top-level
 * declarations a kept `optimistic` reads as values, and the imports those use. Nothing else: no `run`, no database
 * client, no other export, and no types (they're erased, and `z.infer<typeof input>` would keep `input` and zod).
 * Exported for tests.
 */
export function clientStubs(code, file, rel, shapes) {
  const ast = parse(file, code)
  const locals = fnLocals(ast)
  const defs = new Map(fnExports(ast, locals).map((f) => [f.node, f]))
  const kept = [] // [start, text]
  const candidates = []
  const names = (text) => new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? [])
  for (const n of ast.program.body) {
    if (n.type === 'ImportDeclaration') {
      if (n.specifiers.length) kept.push([n.start, code.slice(n.start, n.end)]) // pruned below; side-effect imports go
      continue
    }
    const f = defs.get(n)
    if (f && f.single) {
      const opt = prop(f.obj, 'optimistic')
      const id = fnId(f.name, rel)
      const kind = locals.get(f.callee)
      if (kind === 'channel' || kind === 'sharedState') {
        const initial = prop(f.obj, 'initial')
        kept.push([
          n.start,
          `export const ${f.name} = ${f.callee}(${kind === 'sharedState' ? "'', " : ''}{ $id: ${JSON.stringify(id)}, $stub: 1${initial ? `, ${code.slice(initial.start, initial.end)}` : ''} })`,
        ])
        continue
      }
      // The tree the schema gave when there's a table; else what was declared, as it was written.
      const shape =
        shapes?.[id] !== undefined
          ? `shape: ${JSON.stringify(shapes[id])}`
          : prop(f.obj, 'shape') && code.slice(prop(f.obj, 'shape').start, prop(f.obj, 'shape').end)
      kept.push([
        n.start,
        `export const ${f.name} = ${f.callee}({ $id: ${JSON.stringify(id)}${opt ? `, ${code.slice(opt.start, opt.end)}` : ''}${shape ? `, ${shape}` : ''} })`,
      ])
      continue
    }
    const decl = n.type === 'ExportNamedDeclaration' ? n.declaration : n
    if (!decl) continue
    if (/^TS(TypeAlias|Interface)Declaration$/.test(decl.type) || n.exportKind === 'type') continue
    if (/^TS(Enum|Module)Declaration$/.test(decl.type)) {
      // the kinds with code in them, kept like any helper
      candidates.push({ n, declares: [decl.id.name] })
      continue
    }
    const bound =
      decl.type === 'VariableDeclaration'
        ? decl.declarations.flatMap((d) => [...names(code.slice(d.id.start, d.id.end))])
        : decl.id
          ? [decl.id.name]
          : []
    if (bound.length) candidates.push({ n, declares: bound })
  }
  // Helpers a kept `optimistic` reads (and what they read), in source order.
  for (let grew = true; grew;) {
    grew = false
    const used = valueNames(parse(file, kept.map(([, t]) => t).join('\n')))
    for (const c of candidates.splice(0)) {
      if (c.declares.some((d) => used.has(d))) {
        kept.push([c.n.start, code.slice(c.n.start, c.n.end)])
        grew = true
      } else candidates.push(c)
    }
  }
  const out =
    `// weft: client stubs for ${rel} (research 27 §2)\n` +
    kept
      .sort((a, b) => a[0] - b[0])
      .map(([, t]) => t)
      .join('\n') +
    '\n'
  return pruneImports(out, file)
}

/** Q003: a `query`/`mutation` defined in a file that isn't a server module (its name and kind), or undefined. */
export function definesFns(code, file) {
  if (
    !/@weft-js\/start/.test(code) ||
    !/\b(query|mutation|stream|topic|channel|sharedState)\b/.test(code)
  )
    return
  const ast = parse(file, code)
  const locals = fnLocals(ast)
  if (!locals.size) return
  const f = fnExports(ast, locals)[0]
  if (f) return { name: f.name, kind: locals.get(f.callee) }
  for (const [local, kind] of locals)
    if (new RegExp(`(?<![\\w$.])${local}\\s*\\(`).test(code)) return { name: local, kind }
}
