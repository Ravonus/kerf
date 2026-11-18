import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { parse, valueNames, pruneImports } from './syntax.mjs'

// ---- server modules (research 27 §2) ------------------------------------------------------------------------------

/** `src/server/**` and `*.server.ts(x)`: files whose `query`/`mutation` exports become client stubs. */
export const isServerModule = (rel) =>
  rel.startsWith('src/server/') || /\.server\.[cm]?[jt]sx?$/.test(rel)

export function scanServerModules(root, all = false) {
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
        !/\.d\.[cm]?ts$/.test(d.name) &&
        (all || isServerModule(rel))
      )
        out.push(rel)
    }
  }
  walk('src')
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

const FN_KINDS = new Set(['query', 'mutation', 'stream', 'topic', 'channel', 'sharedState'])

/** Local names bound to the `FN_KINDS` from @kerf-js/start. */
function fnLocals(ast, shell = false) {
  const locals = new Map()
  for (const n of ast.program.body) {
    if (
      n.type !== 'ImportDeclaration' ||
      n.importKind === 'type' ||
      !(
        shell ? /^@kerf-js\/start(\/(?:data|channel|live|hub))?$/ : /^@kerf-js\/start(\/data)?$/
      ).test(n.source.value)
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
function fnExports(ast, locals, shell = false) {
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
      if ((!shell && obj?.type !== 'ObjectExpression') || d.id.type !== 'Identifier') continue
      out.push({
        node: n,
        call,
        name: d.id.name,
        callee: call.callee.name,
        obj: obj?.type === 'ObjectExpression' ? obj : undefined,
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
/** A definition's release-side result contract. A topic is server-only, even in a shell release. */
const contractKeys = {
  query: 'output',
  mutation: 'output',
  stream: 'message',
  channel: 'server',
  sharedState: 'value',
}

function schemaValue(value) {
  return (
    value &&
    value.type !== 'Literal' &&
    !(value.type === 'Identifier' && value.name === 'undefined')
  )
}

function declared(f, key) {
  const properties = f.obj?.properties
  const p = f.obj && prop(f.obj, key)
  if (!p || !properties || p.kind !== 'init' || p.method || !schemaValue(p.value)) return false
  if (
    properties.some(
      (other) =>
        other !== p &&
        (other.type === 'SpreadElement' ||
          other.computed ||
          (other.key?.name ?? other.key?.value) === key),
    )
  )
    return false
  if (key !== 'server' || p.value.type !== 'ObjectExpression') return true
  return p.value.properties.every(
    (event) =>
      event.type === 'Property' &&
      event.kind === 'init' &&
      !event.computed &&
      !event.method &&
      schemaValue(event.value),
  )
}

/** Catalog every recognized operation that cannot yield an admitted client stub. */
export function functionContracts(code, file) {
  const ast = parse(file, code)
  const locals = fnLocals(ast, true)
  const definitions = isServerModule(file) ? fnExports(ast, locals, true) : []
  const recognized = new Set(definitions.map((f) => f.call))
  const findings = definitions.flatMap((f) => {
    const kind = locals.get(f.callee)
    const key = contractKeys[kind]
    if (!key) return []
    if (
      f.obj?.properties.some(
        (p) => p.type === 'Property' && (p.key?.name ?? p.key?.value) === '$id',
      )
    )
      return [
        {
          name: f.name,
          at: f.node.start,
          why: 'Shell operation IDs are assigned by Start. Remove the explicit $id.',
        },
      ]
    if (f.single && declared(f, key)) return []
    return [
      {
        name: f.name,
        at: f.node.start,
        why: `Declare ${kind} separately with a release-owned ${key} schema in its options object.`,
      },
    ]
  })
  const namespaces = new Set(
    ast.program.body.flatMap((node) =>
      node.type === 'ImportDeclaration' && /^@kerf-js\/start(\/|$)/.test(node.source.value)
        ? node.specifiers
            .filter((spec) => spec.type === 'ImportNamespaceSpecifier')
            .map((spec) => spec.local.name)
        : [],
    ),
  )
  const constructors = new Map(locals)
  const kindOf = (node) =>
    node?.type === 'MemberExpression' && namespaces.has(node.object.name)
      ? (node.property.name ?? node.property.value)
      : constructors.get(node?.name)
  const walk = (node, name) => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child, name)
      return
    }
    if (typeof node?.type !== 'string' || node.type === 'ImportDeclaration') return
    const at = node.type === 'VariableDeclarator' ? (node.id?.name ?? name) : name
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      const kind = kindOf(node.init)
      if (Object.hasOwn(contractKeys, kind)) constructors.set(node.id.name, kind)
    }
    if (node.type === 'CallExpression' && !recognized.has(node)) {
      const kind = kindOf(node.callee)
      if (Object.hasOwn(contractKeys, kind))
        findings.push({
          name: at ?? kind,
          at: node.start,
          why: `Declare ${kind} as a named import and a direct, separate server export with a release schema.`,
        })
    }
    for (const [key, value] of Object.entries(node))
      if (key !== 'parent' && value && typeof value === 'object') walk(value, at)
  }
  walk(ast.program.body, undefined)
  return findings
}

/** A function's id: its name and a hash of its file, stable across builds. */
export const fnId = (name, rel) =>
  `${name}.${createHash('sha256').update(rel).digest('hex').slice(0, 6)}`

/** The server build of a server module: each definition gets its `$id`. Exported for tests. */
export function withIds(code, file, rel, shell = false) {
  const ast = parse(file, code)
  const locals = fnLocals(ast, shell)
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
  const list = all.filter((f) => shell || !prop(f.obj, '$id'))
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
export function clientStubs(code, file, rel, shapes, shell = false) {
  const ast = parse(file, code)
  const locals = fnLocals(ast, shell)
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
      const schema = shell && prop(f.obj, contractKeys[kind])
      const contract = schema ? `, ${code.slice(schema.start, schema.end)}` : ''
      if (kind === 'channel' || kind === 'sharedState') {
        const initial = prop(f.obj, 'initial')
        kept.push([
          n.start,
          `export const ${f.name} = ${f.callee}(${kind === 'sharedState' ? "'', " : ''}{ $id: ${JSON.stringify(id)}, $stub: 1${initial ? `, ${code.slice(initial.start, initial.end)}` : ''}${contract} })`,
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
        `export const ${f.name} = ${f.callee}({ $id: ${JSON.stringify(id)}${opt ? `, ${code.slice(opt.start, opt.end)}` : ''}${shape ? `, ${shape}` : ''}${contract} })`,
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
    `// kerf: client stubs for ${rel} (research 27 §2)\n` +
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
    !/@kerf-js\/start/.test(code) ||
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
