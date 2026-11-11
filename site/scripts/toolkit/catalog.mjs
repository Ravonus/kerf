import { createRequire } from 'node:module'
import { join, relative } from 'node:path'

const require = createRequire(new URL('../../../packages/cli/package.json', import.meta.url))
const ts = require('typescript')

const slugOf = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
const oneLine = (text) => text.replace(/\s+/g, ' ').trim()

const toolkitPaths = {
  kerf: ['../core/src/index.ts'],
  'kerf/*': ['../core/src/*'],
  '@kerf/veneer-core': ['../veneer-core/src/index.ts'],
  '@kerf/veneer-icons': ['../veneer-icons/src/gen/index.tsx'],
}

function readProps(decl, param, checker) {
  const props = []
  const defaults = new Map()
  const first = decl.parameters?.[0] ?? decl.initializer?.parameters?.[0]
  if (first && ts.isObjectBindingPattern(first.name))
    for (const el of first.name.elements)
      if (el.initializer)
        defaults.set((el.propertyName ?? el.name).getText(), el.initializer.getText())
  // Components that keep `props` whole say their defaults where they read them: `props.size ?? 'md'`. Only a plain
  // literal counts, and only when every read agrees.
  const fallbacks = new Map()
  for (const [, prop, value] of decl
    .getText()
    .matchAll(
      /\bprops\.(\w+)\s*\?\?\s*('[^'\n]*'|"[^"\n]*"|-?\d[\d_.]*|true|false)(?=\s*[,;)}\]:])/g,
    ))
    fallbacks.set(prop, fallbacks.has(prop) && fallbacks.get(prop) !== value ? null : value)
  for (const [prop, value] of fallbacks)
    if (value !== null && !defaults.has(prop)) defaults.set(prop, value)
  // A prop the file falls back from with something worked out (`props.searchable ?? items.length > LONG`) has no one
  // default, and mustn't be shown one.
  const fileText = decl.getSourceFile().text
  const worked = new Set(
    [
      ...fileText.matchAll(
        /\.(\w+)\s*\?\?\s*(?!('[^'\n]*'|"[^"\n]*"|-?\d[\d_.]*|true|false)\s*[,;)}\]:])/g,
      ),
    ].map((m) => m[1]),
  )
  // A switch read as `props.wrap !== false` is on unless it's turned off.
  for (const [, prop] of fileText.matchAll(/\.(\w+)\s*!==\s*false\b/g))
    if (!defaults.has(prop)) defaults.set(prop, 'true')
  for (const [, prop] of fileText.matchAll(/\b(\w+)\s*===\s*false\b/g)) worked.add(prop)
  if (param) {
    const type = checker.getTypeOfSymbolAtLocation(param, decl)
    for (const p of type.getProperties?.() ?? []) {
      if (/^(on[A-Z]\w+Capture|__)/.test(p.name)) continue
      const d = p.valueDeclaration ?? p.declarations?.[0]
      if (d?.getSourceFile().fileName.includes('/node_modules/')) continue
      const t = checker.getTypeOfSymbolAtLocation(p, d ?? decl)
      const members = (t.isUnion() ? t.types : [t]).filter(
        (m) => !(m.flags & ts.TypeFlags.Undefined),
      )
      const literal =
        members.length > 1 && members.every((m) => m.isStringLiteral() || m.isNumberLiteral())
      props.push({
        values: literal ? members.map((m) => m.value) : undefined,
        name: p.name,
        type: oneLine(
          checker.typeToString(
            t,
            undefined,
            ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
          ),
        ).replace(/ \| undefined$/, ''),
        required: !(p.flags & ts.SymbolFlags.Optional),
        default:
          defaults.get(p.name) ??
          p
            .getJsDocTags(checker)
            .find((tag) => tag.name === 'default')
            ?.text?.map((x) => x.text)
            .join('')
            .trim(),
        worked: worked.has(p.name) && !defaults.has(p.name) ? true : undefined,
        doc: oneLine(ts.displayPartsToString(p.getDocumentationComment(checker))),
      })
    }
  }
  return props
}

export function readToolkit(repo) {
  const veneer = join(repo, 'packages/veneer')
  const parsed = ts.parseJsonConfigFileContent(
    {
      compilerOptions: {
        jsx: 'preserve',
        target: 'esnext',
        module: 'esnext',
        moduleResolution: 'bundler',
        skipLibCheck: true,
        noEmit: true,
        strict: true,
        types: [],
        allowImportingTsExtensions: true,
        paths: toolkitPaths,
      },
      files: ['src/index.ts'],
    },
    ts.sys,
    veneer,
  )
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const checker = program.getTypeChecker()
  const entry = program.getSourceFile(join(veneer, 'src/index.ts'))
  const out = []
  for (let sym of checker.getExportsOfModule(checker.getSymbolAtLocation(entry))) {
    const name = sym.name
    if (!/^[A-Z]/.test(name)) continue
    if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym)
    const decl = sym.valueDeclaration
    if (!decl) continue
    const file = decl.getSourceFile().fileName
    if (file.includes('/node_modules/')) continue
    const sig = checker.getTypeOfSymbolAtLocation(sym, decl).getCallSignatures()[0]
    if (!sig) continue
    const param = sig.parameters[0]
    const props = readProps(decl, param, checker)
    const doc = oneLine(ts.displayPartsToString(sym.getDocumentationComment(checker)))
    const rel = relative(veneer, file)
    const body = decl.getText()
    const parts = [...new Set([...body.matchAll(/data-part="([a-z-]+)"/g)].map((m) => m[1]))]
    const scope = /data-scope="([a-z-]+)"/.exec(body)?.[1]
    const states = [
      ...new Set(
        [...body.matchAll(/\b(data-(?!part|scope|act|close|site)[a-z-]+)=/g)].map((m) => m[1]),
      ),
    ]
    out.push({
      name,
      slug: slugOf(name),
      file: `packages/veneer/${rel}`,
      doc,
      props,
      parts,
      scope,
      states,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
