// The two ways to ask a checker about a shadow. Both answer the same four questions about a span (`query`), so the
// engine doesn't know which compiler it is on. `tsgoHost` drives TypeScript 7's process through its unstable API with a
// file overlay: `tsc --noEmit` of the source tree, with no files on disk and no plugin. `languageHost` reuses a language
// service, which is what a tsserver plugin has, and what a project on TypeScript 6 gets.

const { boxMismatch } = require('./box-props.cjs')
const { derivedWrite } = require('./derived-writes.cjs')

const NO_TRUNCATE = 1

/** The node exactly on [start, end]: the deepest one, because `x` and `x;` can share an end but not a start. */
function nodeAt(each, root, start, end) {
  let best = null
  const go = (n) => {
    if (n.pos <= start && n.end >= end) {
      if (n.end === end) best = n
      each(n, go)
    }
  }
  each(root, go)
  return best
}

/** The flags the engine reads. `lit`: the widened text differs from the exact one. */
function describe(checker, type, flagsAny, node) {
  if (!type) return { text: 'any', any: true }
  const widened =
    checker.getWidenedType?.(checker.getBaseTypeOfLiteralType(type)) ??
    checker.getBaseTypeOfLiteralType(type)
  const text = checker.typeToString(widened, node, NO_TRUNCATE)
  const exact = checker.typeToString(type, node, NO_TRUNCATE)
  return { text, exact: exact === text ? undefined : exact, any: !!(type.flags & flagsAny) }
}

function answer(checker, node, req, env) {
  if (!node) return { text: 'any', any: true, missing: true }
  switch (req.kind) {
    case 'type':
      return describe(checker, checker.getTypeAtLocation(node), env.Any, node)
    case 'context':
      return describe(checker, checker.getContextualType(node), env.Any, node)
    case 'spread': {
      const type = checker.getTypeAtLocation(node)
      if (!type || type.flags & env.Any) return { any: true, props: [] }
      return {
        props: checker.getPropertiesOfType(type).map((s) => ({
          name: s.name,
          optional: !!(s.flags & env.Optional),
          ...describe(checker, checker.getTypeOfSymbol(s), env.Any, node),
        })),
      }
    }
    case 'decls': {
      const type = checker.getTypeAtLocation(node)
      if (!type) return { decls: [] }
      const members = env.union(type) ?? [type]
      return {
        decls: members
          .flatMap((t) => checker.getSignaturesOfType(t, env.Call).map((s) => env.place(s)))
          .filter(Boolean),
      }
    }
  }
}

/** Over TypeScript 7's API. `typescript/unstable/*` is a moving name, so this is the one file that touches it. */
async function tsgoHost({ root, config, typescriptDir, overlay }) {
  const load = (name) =>
    import(require('node:url').pathToFileURL(require('node:path').join(typescriptDir, name)).href)
  const { API, SignatureKind, SymbolFlags, TypeFlags } = await load('dist/api/sync/api.js')
  const each = (n, f) => n.forEachChild(f)
  const api = new API({ cwd: root, fs: { readFile: (f) => overlay.get(f) } })
  let snap = api.updateSnapshot({ openProject: config })
  let project = snap.getProject(config) ?? snap.getProjects()[0]
  const env = {
    Any: TypeFlags.Any,
    Optional: SymbolFlags.Optional,
    Call: SignatureKind.Call,
    union: (t) => (t.isUnionType() ? t.getTypes() : null),
    place(s) {
      const n = s.declaration?.resolve(project)
      return n && { file: s.declaration.path, pos: n.pos, end: n.end }
    },
  }
  return {
    kind: 'tsgo',
    update(files, touched = []) {
      for (const [f, text] of files) overlay.set(f, text)
      const next = api.updateSnapshot({ fileChanges: { changed: [...files.keys(), ...touched] } })
      snap.dispose?.()
      snap = next
      project = snap.getProject(config) ?? snap.getProjects()[0]
    },
    query(file, reqs) {
      const sf = project.program.getSourceFile(file)
      if (!sf) return reqs.map(() => ({ text: 'any', any: true, missing: true }))
      return reqs.map((r) => answer(project.checker, nodeAt(each, sf, r.start, r.end), r, env))
    },
    diagnostics(file) {
      return [
        ...project.program.getSyntacticDiagnostics(file),
        ...project.program.getSemanticDiagnostics(file),
      ].map((d) => ({ start: d.pos, length: d.end - d.pos, code: d.code, text: flatten(d) }))
    },
    allDiagnostics() {
      return project.program
        .getSourceFileNames()
        .filter((f) => !f.includes('/node_modules/'))
        .flatMap((f) => this.diagnostics(f).map((d) => ({ ...d, file: f })))
    },
    close() {
      snap.dispose?.()
      api.close()
    },
  }
}

const flatten = (d) =>
  (typeof d.text === 'string' ? d.text : (d.message ?? d.messageText ?? String(d.text))) +
  (d.messageChain?.length ? `\n  ${d.messageChain.map(flatten).join('\n  ')}` : '')

/** Over a TypeScript language service: `service()` returns it, `sync()` makes it see what `update` was told. */
function languageHost(ts, service, sync = () => {}) {
  const env = {
    Any: ts.TypeFlags.Any,
    Optional: ts.SymbolFlags.Optional,
    Call: ts.SignatureKind.Call,
    union: (t) => (t.isUnion() ? t.types : null),
    place(s) {
      const n = s.declaration
      return n && { file: n.getSourceFile().fileName, pos: n.pos, end: n.end }
    },
  }
  const each = (n, f) => ts.forEachChild(n, f)
  return {
    kind: 'language-service',
    update(files, touched = []) {
      sync(files, touched)
    },
    query(file, reqs) {
      const program = service().getProgram()
      const sf = program.getSourceFile(file)
      if (!sf) return reqs.map(() => ({ text: 'any', any: true, missing: true }))
      const checker = program.getTypeChecker()
      return reqs.map((r) => answer(checker, nodeAt(each, sf, r.start, r.end), r, env))
    },
    diagnostics(file) {
      const s = service()
      return [...s.getSyntacticDiagnostics(file), ...s.getSemanticDiagnostics(file)].map((d) => ({
        start: d.start ?? 0,
        length: d.length ?? 0,
        code: d.code,
        text: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        weft: derivedWrite(ts, s.getProgram(), d) ?? boxMismatch(ts, s.getProgram(), d),
      }))
    },
    close() {},
  }
}

module.exports = { tsgoHost, languageHost, nodeAt }
