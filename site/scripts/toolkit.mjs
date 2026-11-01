// The toolkit's facts, read from warp's source so they can't drift: its exports, each one's props from the type checker,
// and which test fixtures render it. Those fixtures are the previews: the same code warp's budgets and a11y suite run.
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { readdirSync, readFileSync } from 'node:fs'

const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url))
const ts = require('typescript')

const GROUPS = [
  ['Layout', /\/(Layout|Shell)\.tsx$/],
  ['Type', /\/(Type|Kbd|Icon|CodeBlock|Markdown)\.tsx$/],
  ['Actions', /\/(Button|Toggle|CommandPalette|Chip|Tag|Badge)\.tsx$/],
  ['Inputs', /\/(Field|Select|Choice|CodeInput|KeyValueEditor|RichTextEditor|MentionsInput|PaymentCard|SignaturePad|PlaceField|RichSelect)\.tsx$/],
  ['Dates and time', /\/(Calendar|DateField|TimeField|MonthPicker|DurationField|RecurrenceField)\.tsx$/],
  ['Overlays', /\/(Modal|Drawer|Popover|Tooltip|Toast)\.tsx$/],
  ['Feedback', /\/(Alert|Progress|Spinner|Skeleton|Shape)\.tsx$/],
  ['Surfaces', /\/(Card|Tabs|Pagination)\.tsx$/],
  ['Data', /\/(Table|DataGrid|ScrollGrid|VirtualList|Feed)\.tsx$/],
  ['Charts', /\/charts?\/|\/Chart[^/]*\.tsx$/],
  ['Agent', /\/agent\//], ['Schedule', /\/schedule\//], ['Live', /\/live\//], ['Collaboration', /\/collab\//], ['Flow', /\/flow\//], ['Admin', /\/admin\//],
]

const slugOf = name => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
const oneLine = text => text.replace(/\s+/g, ' ').trim()

export function readToolkit(repo) {
  const warp = join(repo, 'packages/warp')
  const parsed = ts.parseJsonConfigFileContent({ compilerOptions: { jsx: 'preserve', target: 'esnext', module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true, noEmit: true, strict: true, types: [], allowImportingTsExtensions: true, paths: { weft: ['../weft/src/index.ts'], 'weft/*': ['../weft/src/*'], '@weft/ui-core': ['../ui-core/src/index.ts'], '@weft/icons': ['../icons/src/gen/index.tsx'] } }, files: ['src/index.ts'] }, ts.sys, warp)
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const checker = program.getTypeChecker()
  const entry = program.getSourceFile(join(warp, 'src/index.ts'))
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
    const props = []
    const defaults = new Map()
    const first = decl.parameters?.[0] ?? decl.initializer?.parameters?.[0]
    if (first && ts.isObjectBindingPattern(first.name)) for (const el of first.name.elements) if (el.initializer) defaults.set((el.propertyName ?? el.name).getText(), el.initializer.getText())
    if (param) {
      const type = checker.getTypeOfSymbolAtLocation(param, decl)
      for (const p of type.getProperties?.() ?? []) {
        if (/^(on[A-Z]\w+Capture|__)/.test(p.name)) continue
        const d = p.valueDeclaration ?? p.declarations?.[0]
        if (d?.getSourceFile().fileName.includes('/node_modules/')) continue
        const t = checker.getTypeOfSymbolAtLocation(p, d ?? decl)
        props.push({
          name: p.name,
          type: oneLine(checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope)).replace(/ \| undefined$/, ''),
          required: !(p.flags & ts.SymbolFlags.Optional),
          default: defaults.get(p.name),
          doc: oneLine(ts.displayPartsToString(p.getDocumentationComment(checker))),
        })
      }
    }
    const doc = oneLine(ts.displayPartsToString(sym.getDocumentationComment(checker)))
    const rel = relative(warp, file)
    const group = GROUPS.find(([, re]) => re.test(`/${rel}`))?.[0] ?? 'More'
    out.push({ name, slug: slugOf(name), group, file: `packages/warp/${rel}`, doc, props })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Every exported component in warp's fixtures, with its source and the warp components it renders. */
export function readFixtures(dir) {
  const found = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.tsx') || f === 'interactions.tsx') continue
    const text = readFileSync(join(dir, f), 'utf8')
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const locals = new Map()
    sf.forEachChild(n => {
      if (ts.isFunctionDeclaration(n) && n.name) locals.set(n.name.text, n)
      if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) locals.set(d.name.text, n)
    })
    const tagsOf = (name, seen = new Set()) => {
      if (seen.has(name) || !locals.has(name)) return []
      seen.add(name)
      const tags = [...locals.get(name).getText().matchAll(/<([A-Z]\w+)/g)].map(m => m[1])
      return [...tags, ...tags.flatMap(t => tagsOf(t, seen))]
    }
    sf.forEachChild(n => {
      const exported = ts.canHaveModifiers(n) && ts.getModifiers(n)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
      if (!exported) return
      const take = (name, params) => {
        if (!/^[A-Z]/.test(name) || params.length) return
        found.push({ file: f, name, source: n.getText().replace(/^export /, ''), tags: [...new Set(tagsOf(name))].filter(t => !locals.has(t)) })
      }
      if (ts.isFunctionDeclaration(n) && n.name) take(n.name.text, n.parameters)
      if (ts.isVariableStatement(n)) {
        for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer && ts.isArrowFunction(d.initializer)) take(d.name.text, d.initializer.parameters)
      }
    })
  }
  return found
}
