import { parseSync } from 'vite'

const SERVER_EXPORTS = new Set(['load', 'meta', 'prerender'])

/**
 * The client build of a route module: `load`, `meta` and `prerender` removed (they run on the server; loaders can
 * hold database code and secrets), then imports nothing else uses. Exported for tests.
 */
function serverCuts(code, file) {
  const ast = parseSync(file, code, {
    lang: file.endsWith('.tsx') ? 'tsx' : file.endsWith('.ts') ? 'ts' : 'jsx',
    sourceType: 'module',
  })
  const cuts = []
  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue
    const d = node.declaration
    const names =
      d.type === 'VariableDeclaration' ? d.declarations.map((x) => x.id?.name) : [d.id?.name]
    if (names.length && names.every((n) => SERVER_EXPORTS.has(n))) cuts.push([node.start, node.end])
  }
  return cuts
}

export const serverExports = (code, file) =>
  serverCuts(code, file)
    .map(([a, b]) => code.slice(a, b))
    .join('\n')

/** The server-only exports of a route file, cut out of the client's copy. */
export function stripServerExports(code, file = 'route.tsx') {
  const cuts = serverCuts(code, file)
  if (!cuts.length) return code
  let out = code
  for (const [a, b] of cuts.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + out.slice(b)
  // Imports whose bindings are no longer used go too (a db client a loader imported must not reach the browser).
  return pruneImports(out, file)
}

export const parse = (file, code) =>
  parseSync(file, code, {
    lang: file.endsWith('.tsx') ? 'tsx' : /\.[cm]?ts$/.test(file) ? 'ts' : 'jsx',
    sourceType: 'module',
  })

/** The TS nodes that hold code; every other `TS*` node is a type, gone once TypeScript is stripped. */
const TS_VALUE =
  /^TS((As|Satisfies|NonNull|Instantiation)Expression|TypeAssertion|Enum\w+|Module\w+|ImportEqualsDeclaration|ExternalModuleReference|ParameterProperty|ExportAssignment)$/
const NAMED_MEMBER = /^(Property|MethodDefinition|PropertyDefinition|AccessorProperty)$/
const binds = (p) =>
  !p
    ? []
    : p.type === 'Identifier'
      ? [p.name]
      : (p.properties ?? p.elements ?? [p.value ?? p.left ?? p.argument ?? p.parameter]).flatMap(
          binds,
        )
const declares = (s) =>
  s.type === 'VariableDeclaration'
    ? s.declarations.flatMap((d) => binds(d.id))
    : /^(Function|Class)Declaration$/.test(s.type) && s.id
      ? [s.id.name]
      : []

/**
 * The outer names `ast` reads at run time. Not types (`typeof x` in one reads nothing), property names, or what a
 * function or block binds itself: `optimistic: ({ input }) => …` doesn't use a top-level `input`. It errs towards a name
 * being used: a kept import is a bigger bundle, a dropped one a crash.
 */
export function valueNames(ast) {
  const out = new Set()
  const walk = (n, bound) => {
    if (Array.isArray(n)) return n.forEach((x) => walk(x, bound))
    if (
      typeof n?.type !== 'string' ||
      n.type === 'ImportDeclaration' ||
      n.exportKind === 'type' ||
      (n.type.startsWith('TS') && !TS_VALUE.test(n.type))
    )
      return
    if (n.type === 'Identifier' || n.type === 'JSXIdentifier') {
      if (!bound.has(n.name)) out.add(n.name)
      return
    }
    const inner = /^(Arrow)?Function/.test(n.type)
      ? [...(n.id ? [n.id.name] : []), ...n.params.flatMap(binds)]
      : n.type === 'BlockStatement'
        ? n.body.flatMap(declares)
        : []
    const scope = inner.length ? new Set([...bound, ...inner]) : bound
    const skip = n.computed
      ? undefined
      : n.type === 'MemberExpression'
        ? 'property'
        : NAMED_MEMBER.test(n.type)
          ? 'key'
          : undefined
    for (const k in n)
      if (k !== skip && k !== 'parent' && n[k] && typeof n[k] === 'object') walk(n[k], scope)
  }
  walk(ast.program.body, new Set())
  return out
}

/** Drop value import specifiers nothing in `out` reads (and imports left empty). */
export function pruneImports(out, file) {
  const again = parse(file, out)
  const imports = again.program.body.filter(
    (n) => n.type === 'ImportDeclaration' && n.specifiers.length,
  )
  const used = valueNames(again)
  let rest = out
  for (const imp of imports)
    rest = rest.slice(0, imp.start) + ' '.repeat(imp.end - imp.start) + rest.slice(imp.end)
  const spelled = new Set(rest.match(/[A-Za-z_$][\w$]*/g)) // a type import is erased, so a type may keep it
  for (const imp of imports.sort((x, y) => y.start - x.start)) {
    const keep = imp.specifiers.filter((s) =>
      (imp.importKind === 'type' || s.importKind === 'type' ? spelled : used).has(s.local.name),
    )
    if (keep.length === imp.specifiers.length) continue
    const text = keep.length ? rewriteImport(imp, keep, out) : ''
    out = out.slice(0, imp.start) + text + out.slice(imp.end)
  }
  return out
}

function rewriteImport(imp, keep, code) {
  const def = keep.find((s) => s.type === 'ImportDefaultSpecifier')
  const ns = keep.find((s) => s.type === 'ImportNamespaceSpecifier')
  const named = keep
    .filter((s) => s.type === 'ImportSpecifier')
    .map((s) => code.slice(s.start, s.end))
  const parts = [
    def && def.local.name,
    ns && `* as ${ns.local.name}`,
    named.length && `{ ${named.join(', ')} }`,
  ].filter(Boolean)
  return `import ${imp.importKind === 'type' ? 'type ' : ''}${parts.join(', ')} from ${code.slice(imp.source.start, imp.source.end)}`
}
