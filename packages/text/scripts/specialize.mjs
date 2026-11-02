// Build-time specialisation of the vendored Pretext source (vendor/pretext/src, @chenglou/pretext 1.0.0).
//
// For each engine (blink, webkit, gecko) it writes gen/<engine>/ with:
//   1. the engine profile constant-folded, so esbuild drops the other engines' branches (lever a);
//   2. engine data re-encoded for that engine only, with the base copy restricted to the base alphabet
//      (src/alphabet.json) and the full copy installed later by the `scripts` pack (levers a, c, g);
//   3. selected functions moved out of the base into lazy packs (levers c, d): the base keeps a stub that
//      calls the pack, or throws PackMissing when the pack is not loaded. The moved code is the upstream
//      code, unchanged, so a loaded pack behaves exactly like upstream.
//
// Nothing here changes an algorithm. Every edit is mechanical so that a new upstream version re-specialises
// with the same script, and test/accuracy diffs the result against unmodified upstream on the corpus.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { genEngineData } from './gendata.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vendor = path.join(root, 'vendor/pretext/src')
const ALPHABET = JSON.parse(fs.readFileSync(path.join(root, 'src/alphabet.json'), 'utf8'))

// pack -> module -> functions. Every call site upstream is behind a guard that base text never meets
// (see the comment per pack); the provider checks the same conditions before it prepares.
const MOVES = {
  // Text with hard breaks, preserved spaces, tabs, soft hyphens, letter spacing or no break at a segment
  // boundary takes the full line walker. Provider gate: !handle.simpleLineWalkFastPath or UNBROKEN flags.
  complex: { 'line-break.ts': ['walkPreparedComplexLines'] },
  // Script-only code. Guards: Han kerning (textMayHanKern), kana pairs (kanaPairRe), U+3000, and SA
  // dictionary runs. None of those characters is in the base alphabet. Provider gate: alphabet scan.
  scripts: {
    // not han-kerning.ts: Blink asks it of every text with a curly quote (textMayHanKern), Latin too
    'measurement.ts': ['getFontKanaKerning', 'getKanaKerning'],
    'prepare.ts': ['addKanaKerning', 'addIdeographicSpaceHangs'],
    'line-breaks.ts': ['markDictionaryWords'],
  },
  // letterSpacing != 0 only. Provider gate: options.letterSpacing.
  spacing: {
    'measurement.ts': ['getExtraSpacings'],
    'prepare.ts': ['getUnspacedGraphemes'],
    'line-break.ts': ['getTerminalLetterSpacing'],
  },
  // WebKit only: the generic families a language names, computed on the first font string that holds a
  // generic keyword (patched below). Provider gate: font string has a generic keyword and a language is set.
  families: { 'measurement.ts': ['getWebKitGenericFamilies'] },
  // rich-inline paragraphs only (paragraph !== null). weft does not use rich-inline (research 11 §2.2), so
  // this pack is never built into a chunk; the stubs throw.
  rich: { 'analysis.ts': ['alignToSource', 'markItemStarts', 'getWebKitParagraphBreaks', 'removeItemsSkippableSegmentBreaks'] },
}

function readProfile(engine) {
  const m = fs.readFileSync(path.join(vendor, 'measurement.ts'), 'utf8')
  const body = m.slice(m.indexOf('function buildEngineProfile'))
  const lit = body.slice(body.indexOf('  return {') + 9, body.indexOf('\n  }\n') + 4)
  const profile = new Function('engine', 'navigator', 'return ' + lit)(engine, { platform: 'MacIntel' })
  // Runtime on WebKit: macOS/iOS name generic families by language, Linux/Windows WebKit do not.
  const runtime = engine === 'webkit' ? ['namesGenericFamiliesByLanguage'] : []
  for (const k of runtime) delete profile[k]
  return { profile, runtime }
}

// 1. constant-fold profile reads: `<recv>.field` where recv is getEngineProfile() or one of the names upstream
// binds it to. Only those: FontMeasurement has a `hanKerning` cache field that shares a name with the profile's.
const foldedKeys = new Set()
function foldProfile(src, engine, profile) {
  let n = 0
  for (const [k, v] of Object.entries(profile)) {
    const re = new RegExp(`(?:getEngineProfile\\(\\)|(?<![\\w$.])(?:profile|engineProfile|cachedEngineProfile))\\.${k}\\b(?!\\s*=[^=])`, 'g')
    src = src.replace(re, () => { n++; foldedKeys.add(k); return JSON.stringify(v) })
  }
  // `scan` parameters carry profile.lineBreakScan
  src = src.replace(/\bscan (===|!==) '(\w+)'/g, (_, op, e) => { n++; return `'${engine}' ${op} '${e}'` })
  return { src, n }
}

// 3. move functions: returns { base, lazy } sources for one module. A requested function leaves a stub in the
// base; a helper that only moved code references (and that upstream does not export) moves with it.
function moveFunctions(file, src, moves /* name -> pack */) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true)
  const decls = []
  for (const st of sf.statements) {
    let names = [], value = true
    if (ts.isFunctionDeclaration(st) && st.name) names = [st.name.text]
    else if (ts.isVariableStatement(st)) names = st.declarationList.declarations.filter(d => ts.isIdentifier(d.name)).map(d => d.name.text)
    else if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isClassDeclaration(st)) { names = st.name ? [st.name.text] : []; value = ts.isClassDeclaration(st) }
    if (!names.length) continue
    const refs = new Set()
    const walk = n => {
      if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) refs.add(n.text)
      ts.forEachChild(n, walk)
    }
    walk(st)
    for (const nm of names) refs.delete(nm)
    // module-level bindings this declaration assigns (a moved copy could not: imports are read-only)
    const writes = new Set()
    const ww = n => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && ts.isIdentifier(n.left)) writes.add(n.left.text)
      if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && ts.isIdentifier(n.operand) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) writes.add(n.operand.text)
      ts.forEachChild(n, ww)
    }
    if (ts.isFunctionDeclaration(st)) ww(st)
    decls.push({ st, names, value, refs, writes, exported: !!st.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword), pack: ts.isFunctionDeclaration(st) ? moves[st.name.text] : undefined, requested: ts.isFunctionDeclaration(st) && !!moves[st.name?.text] })
  }
  // a function that assigns a module-level binding staying in the base cannot move (its copy would assign
  // an import); drop such requests until none is left
  const topLet = new Map()
  for (const d of decls) if (ts.isVariableStatement(d.st)) for (const n of d.names) topLet.set(n, d)
  for (let changed = true; changed;) {
    changed = false
    for (let k = 0; k < 2; k++) for (let c2 = true; c2;) {
      c2 = false
      for (const d of decls) {
        if (d.pack || !d.value || d.exported) continue
        const referrers = decls.filter(o => o !== d && d.names.some(n => o.refs.has(n)))
        if (!referrers.length) continue
        const packs = new Set(referrers.map(o => o.pack))
        if (packs.size === 1 && !packs.has(undefined)) { d.pack = [...packs][0]; c2 = true; changed = true }
      }
    }
    for (const d of decls) {
      if (!d.pack) continue
      for (const w of d.writes) {
        const owner = topLet.get(w)
        if (owner && owner.pack !== d.pack) { d.pack = undefined; d.requested = false; changed = true; break }
      }
    }
    // helpers that moved only because of a function that no longer moves come back
    for (const d of decls) {
      if (!d.pack || d.requested) continue
      const referrers = decls.filter(o => o !== d && d.names.some(n => o.refs.has(n)))
      if (referrers.some(o => o.pack !== d.pack)) { d.pack = undefined; changed = true }
    }
    if (changed) continue
    break
  }
  for (let changed = false; changed;) {
    changed = false
    for (const d of decls) {
      if (d.pack || !d.value || d.exported) continue
      const referrers = decls.filter(o => o !== d && d.names.some(n => o.refs.has(n)))
      if (!referrers.length) continue
      const packs = new Set(referrers.map(o => o.pack))
      if (packs.size === 1 && !packs.has(undefined)) { d.pack = [...packs][0]; changed = true }
    }
  }
  const edits = [], moved = {}, topNames = [], stubs = []
  for (const d of decls) {
    const st = d.st
    if (d.pack) {
      const text = src.slice(st.getStart(sf), st.end).replace(/^export\s+/, '')
      ;(moved[d.pack] ??= []).push(text)
      if (d.requested) {
        const name = st.name.text
        stubs.push({ n: name, pack: d.pack })
        const params = st.parameters.map(p => p.getText(sf).replace(/\s*=[^,]*$/, '')).join(', ')
        const ret = st.type ? st.type.getText(sf) : 'any'
        edits.push([st.getStart(sf), st.end, `export function ${name}(${params}): ${ret} {\n  return (__packs.${name} ?? __missing('${d.pack}', '${name}'))(${st.parameters.map(p => p.name.getText(sf)).join(', ')})\n}`])
      } else edits.push([st.getStart(sf), st.end, `// moved to the "${d.pack}" pack: ${d.names.join(', ')}`])
      continue
    }
    topNames.push(...d.names.map(n => ({ n, type: !d.value })))
    if (!d.exported) edits.push([st.getStart(sf), st.getStart(sf), 'export '])
  }
  edits.sort((a, b) => b[0] - a[0])
  let base = src
  for (const [s0, e, t] of edits) base = base.slice(0, s0) + t + base.slice(e)
  const imports = sf.statements.filter(ts.isImportDeclaration).map(d => d.getText(sf))
  const lazy = {}
  for (const [pack, texts] of Object.entries(moved)) {
    const mod = './' + file.replace(/\.ts$/, '.js')
    const values = [...topNames.filter(x => !x.type).map(x => x.n), ...stubs.filter(x => x.pack !== pack).map(x => x.n)]
    const types = topNames.filter(x => x.type).map(x => x.n)
    lazy[pack] = [
      `// Moved here from ${file} by scripts/specialize.mjs (pack "${pack}"). Upstream code, unchanged.`,
      ...imports,
      values.length ? `import { ${values.join(', ')} } from '${mod}'` : '',
      types.length ? `import type { ${types.join(', ')} } from '${mod}'` : '',
      ...texts.map(t => 'export ' + t),
    ].join('\n') + '\n'
  }
  if (Object.keys(moved).length) base = `import { __packs, __missing } from './packs.js'\n` + base
  return { base, lazy }
}

// Modules layout() runs: never split by coverage, since layout must not throw.
const LAYOUT_TIME = new Set(['line-break.ts', 'layout.ts', 'line-text.ts', 'graphemes.ts'])
// Called by the specialiser's own code or the provider.
const KEEP = new Set(['__resetEngineData', 'installEngineData', 'getEngineProfile', 'clearMeasurementCaches', 'setLocaleLanguage', 'clearWordSegmenter', 'clearCache', 'setLocale'])

export async function specialize(engine, { useCoverage = true } = {}) {
  const covFile = path.join(root, 'src/coverage', `${engine}.json`)
  const rare = useCoverage && fs.existsSync(covFile) ? new Set(JSON.parse(fs.readFileSync(covFile, 'utf8')).ran) : null
  const out = path.join(root, 'gen', engine)
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(path.join(out, 'generated'), { recursive: true })
  const { profile } = readProfile(engine)
  const files = fs.readdirSync(vendor).filter(f => f.endsWith('.ts') && f !== 'rich-inline.ts')
  const packFiles = {} // pack -> [file]
  let folds = 0
  foldedKeys.clear()
  const foundMoves = new Set()
  for (const f of files) {
    let src = fs.readFileSync(path.join(vendor, f), 'utf8')
    const r = foldProfile(src, engine, profile); src = r.src; folds += r.n
    if (f === 'measurement.ts') {
      // Every profile field is folded at its reads, so the profile object is never read: build an empty one.
      src = src.replace(/function buildEngineProfile\(\): EngineProfile \{[\s\S]*?\n\}\n/, engine === 'webkit'
        ? `function buildEngineProfile(): EngineProfile {\n  return { namesGenericFamiliesByLanguage: !/^(?:Linux|Win32|Haiku|$)/.test(navigator.platform) } as EngineProfile\n}\n`
        : `function buildEngineProfile(): EngineProfile {\n  return {} as EngineProfile\n}\n`)
      if (engine === 'webkit') {
        // Resolve the language's generic families on the first font string that names a generic keyword,
        // not on the first measurement: getCanvasFont returns a font without one unchanged, so this is the
        // same answer, and Latin pages whose fonts name families never load the families pack.
        const a = 'genericFamilies: language !== null && profile.namesGenericFamiliesByLanguage ? getWebKitGenericFamilies(language, context) : null,'
        if (!src.includes(a)) throw new Error('webkit families patch: anchor missing')
        src = src.replace(a, 'genericFamilies: language !== null && profile.namesGenericFamiliesByLanguage ? (undefined as unknown as string[]) : null,')
        const b = 'const canvasFont = state.genericFamilies === null ? font : getCanvasFont(font, state.genericFamilies)'
        if (!src.includes(b)) throw new Error('webkit families patch: anchor 2 missing')
        src = src.replace(b, 'const canvasFont = state.genericFamilies === null || !genericKeywordRe.test(font) ? font : getCanvasFont(font, state.genericFamilies ??= getWebKitGenericFamilies(state.language!, state.context))')
        src += `\n// specialize.mjs: a superset test for genericKeywords (getCanvasFont decides exactly).\nexport const genericKeywordRe = new RegExp('(?:^|[\\\\s,])(?:' + genericKeywords.join('|') + ')\\\\s*(?:,|$)', 'i')\n`
      }
    }
    // reset hooks for caches over engine data, called when the scripts pack installs the full tables
    const resets = {
      'line-breaks.ts': 'classRuns = null; classRemaps = null; for (const k in breakRules) delete (breakRules as Record<string, unknown>)[k]; webkitLineRules.clear()',
      'graphemes.ts': 'for (const k in graphemeRules) delete (graphemeRules as Record<string, unknown>)[k]',
      'prepare.ts': 'scriptClasses = null',
      'gecko-line-breaks.ts': 'eastAsianWidths = null; lineData = null',
    }
    if (resets[f]) src += `\n// specialize.mjs: drop what was unpacked from the base tables once the full tables are installed.\nexport function __resetEngineData(): void { ${resets[f]} }\n`
    const moves = {}
    for (const [pack, mods] of Object.entries(MOVES)) for (const fn of mods[f] ?? []) moves[fn] = pack
    // coverage-guided: prepare-time functions that never ran on in-alphabet text go to "rare"
    if (rare && !LAYOUT_TIME.has(f)) {
      for (const st of ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true).statements) {
        if (ts.isFunctionDeclaration(st) && st.name && st.body && !rare.has(st.name.text) && !moves[st.name.text] && !KEEP.has(st.name.text)) moves[st.name.text] = 'rare'
      }
    }
    if (engine !== 'webkit') delete moves.getWebKitGenericFamilies
    for (const st of ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true).statements) if (ts.isFunctionDeclaration(st) && st.name && moves[st.name.text]) foundMoves.add(f + ':' + st.name.text)
    const { base, lazy } = moveFunctions(f, src, moves)
    fs.writeFileSync(path.join(out, f), base)
    for (const [pack, text] of Object.entries(lazy)) {
      const lf = f.replace(/\.ts$/, `.${pack}.ts`)
      fs.writeFileSync(path.join(out, lf), text)
      ;(packFiles[pack] ??= []).push(lf)
    }
  }
  // An upstream bump that renames a moved function or drops a profile field must fail here, not ship.
  for (const [pack, mods] of Object.entries(MOVES)) for (const [mf, fns] of Object.entries(mods)) for (const fn of fns) {
    if (pack === 'families' && engine !== 'webkit') continue
    if (!foundMoves.has(mf + ':' + fn)) throw new Error(`${engine}: ${pack} move ${mf}:${fn} not found upstream`)
  }
  // rich-inline.ts is not built (weft doesn't use it); fields only it reads are fine
  const rich = fs.readFileSync(path.join(vendor, 'rich-inline.ts'), 'utf8')
  const unfolded = Object.keys(profile).filter(k => !foldedKeys.has(k) && !new RegExp(`\\.${k}\\b`).test(rich))
  if (unfolded.length) throw new Error(`${engine}: profile fields never read through profile/engineProfile/getEngineProfile(): ${unfolded.join(', ')}`)
  fs.copyFileSync(path.join(vendor, 'generated/webkit-generic-families.ts'), path.join(out, 'generated/webkit-generic-families.ts'))
  // 2. engine data: base (restricted, mutable) + full (installed by the scripts pack)
  const typesHead = fs.readFileSync(path.join(vendor, 'generated/engine-break-data.ts'), 'utf8').split('\n').filter(l => l.startsWith('export type')).join('\n')
  const baseData = await genEngineData({ upstreamDir: vendor, engine, alphabet: ALPHABET })
  const fullData = await genEngineData({ upstreamDir: vendor, engine, alphabet: null })
  const names = [...baseData.src.matchAll(/^export const (\w+)/gm)].map(m => m[1])
  fs.writeFileSync(path.join(out, 'generated/engine-break-data.ts'), [
    typesHead,
    '// The base alphabet\'s tables. `let`, so installEngineData() can swap in the full ones; ES module',
    '// bindings are live, so every reader sees the swap.',
    baseData.src.replace(/^export const (\w+) =/gm, (_, n) => `export let ${n}: any =`),
    `export function installEngineData(d: any): void { ${names.map(n => `${n} = d.${n}`).join('; ')} }`,
  ].join('\n') + '\n')
  fs.writeFileSync(path.join(out, 'generated/engine-break-data.full.ts'), fullData.src)
  // registry + pack entries
  fs.writeFileSync(path.join(out, 'packs.ts'), `// specialize.mjs: functions the lazy packs provide, by name.
export const __packs: Record<string, any> = {}
export class PackMissing extends Error {
  constructor(readonly pack: string, fn: string) { super(\`text-engine: "\${pack}" pack not loaded (needed by \${fn})\`) }
}
export function __missing(pack: string, fn: string): never { throw new PackMissing(pack, fn) }
`)
  for (const [pack, list] of Object.entries(packFiles)) {
    if (pack === 'rich') continue
    const lines = [`// specialize.mjs: the "${pack}" pack for ${engine}.`, `import { __packs } from './packs.js'`]
    list.forEach((lf, i) => lines.push(`import * as m${i} from './${lf.replace(/\.ts$/, '.js')}'`))
    if (pack === 'scripts') {
      lines.push(`import * as full from './generated/engine-break-data.full.js'`, `import { installEngineData } from './generated/engine-break-data.js'`)
      for (const f of Object.keys({ 'line-breaks.ts': 1, 'graphemes.ts': 1, 'prepare.ts': 1, 'gecko-line-breaks.ts': 1 })) lines.push(`import { __resetEngineData as r_${f.replace(/\W/g, '_')} } from './${f.replace(/\.ts$/, '.js')}'`)
      lines.push(`installEngineData(full)`, ...['line-breaks.ts', 'graphemes.ts', 'prepare.ts', 'gecko-line-breaks.ts'].map(f => `r_${f.replace(/\W/g, '_')}()`))
    }
    lines.push(`Object.assign(__packs, ${list.map((_, i) => `m${i}`).join(', ') ? list.map((_, i) => `m${i}`).join(', ') : '{}'})`)
    fs.writeFileSync(path.join(out, `pack-${pack}.ts`), lines.join('\n') + '\n')
  }
  // gecko has no families pack; give every engine the same pack names
  for (const pack of ['complex', 'scripts', 'spacing', 'families', 'rare']) if (!fs.existsSync(path.join(out, `pack-${pack}.ts`))) fs.writeFileSync(path.join(out, `pack-${pack}.ts`), `// specialize.mjs: nothing to load for ${engine}.\nexport {}\n`)
  return { engine, folds, base: baseData.stats, packs: Object.keys(packFiles) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flags = process.argv.slice(2).filter(a => a.startsWith('--'))
  const list = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const engines = list.length ? list : ['blink', 'webkit', 'gecko']
  for (const e of engines) {
    const r = await specialize(e, { useCoverage: !flags.includes('--no-rare') })
    console.log(`${e}: ${r.folds} profile reads folded; packs: ${r.packs.join(', ')}`)
  }
}
