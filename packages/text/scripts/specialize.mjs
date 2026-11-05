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
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { genEngineData } from './gendata.mjs'
import { inlineWalker } from './specialize/inline-walker.mjs'
import { moveFunctions } from './specialize/move.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vendor = path.join(root, 'vendor/pretext/src')
const ALPHABET = JSON.parse(fs.readFileSync(path.join(root, 'src/alphabet.json'), 'utf8'))
const upstream = path.join(root, 'node_modules/@chenglou/pretext/src')
const upstreamFunctions = new Map(
  fs
    .readdirSync(upstream)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => [
      f,
      new Set(
        ts
          .createSourceFile(
            f,
            fs.readFileSync(path.join(upstream, f), 'utf8'),
            ts.ScriptTarget.Latest,
            true,
          )
          .statements.filter((s) => ts.isFunctionDeclaration(s) && s.name)
          .map((s) => s.name.text),
      ),
    ]),
)
// Coverage names still refer to upstream functions after those functions move to a sibling.
const SPLIT_ORIGINS = {
  'analysis-segments.ts': 'analysis.ts',
  'analysis-whitespace.ts': 'analysis.ts',
  'gecko-line-breaks-clusters.ts': 'gecko-line-breaks.ts',
  'gecko-line-breaks-transform.ts': 'gecko-line-breaks.ts',
  'prepare-common.ts': 'prepare.ts',
  'prepare-finish.ts': 'prepare.ts',
  'prepare-measure.ts': 'prepare.ts',
  'prepare-script.ts': 'prepare.ts',
}

// pack -> module -> functions. Every call site upstream is behind a guard that base text never meets
// (see the comment per pack); the provider checks the same conditions before it prepares.
const MOVES = {
  // Text with hard breaks, preserved spaces, tabs, soft hyphens, letter spacing or no break at a segment
  // boundary takes the full line walker. Provider gate: !handle.simpleLineWalkFastPath or UNBROKEN flags.
  complex: { 'line-break-complex.ts': ['walkPreparedComplexLines'] },
  // Script-only code. Guards: Han kerning (textMayHanKern), kana pairs (kanaPairRe), U+3000, and SA
  // dictionary runs. None of those characters is in the base alphabet. Provider gate: alphabet scan.
  scripts: {
    // not han-kerning.ts: Blink asks it of every text with a curly quote (textMayHanKern), Latin too
    'measurement.ts': ['getFontKanaKerning', 'getKanaKerning'],
    'prepare-finish.ts': ['addKanaKerning', 'addIdeographicSpaceHangs'],
    'line-breaks.ts': ['markDictionaryWords'],
  },
  // letterSpacing != 0 only. Provider gate: options.letterSpacing.
  spacing: {
    'measurement.ts': ['getExtraSpacings'],
    'prepare-script.ts': ['getUnspacedGraphemes'],
    'line-break-complex.ts': ['getTerminalLetterSpacing'],
  },
  // WebKit only: the generic families a language names, computed on the first font string that holds a
  // generic keyword (patched below). Provider gate: font string has a generic keyword and a language is set.
  families: { 'measurement.ts': ['getWebKitGenericFamilies'] },
  // rich-inline paragraphs only (paragraph !== null). weft does not use rich-inline (research 11 §2.2), so
  // this pack is never built into a chunk; the stubs throw.
  rich: {
    'analysis.ts': [
      'alignToSource',
      'markItemStarts',
      'getWebKitParagraphBreaks',
      'removeItemsSkippableSegmentBreaks',
    ],
  },
}

function readProfile(engine) {
  const m = fs.readFileSync(path.join(vendor, 'measurement-engine.ts'), 'utf8')
  const body = m.slice(m.indexOf('function buildEngineProfile'))
  const lit = body.slice(body.indexOf('  return {') + 9, body.indexOf('\n  }\n') + 4)
  // oxlint-disable-next-line no-new-func, typescript/no-implied-eval -- `lit` is the object literal in the vendored, pinned Pretext source, and it has to run to fold its reads
  const profile = new Function('engine', 'navigator', 'return ' + lit)(engine, {
    platform: 'MacIntel',
  })
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
    const re = new RegExp(
      `(?:getEngineProfile\\(\\)|(?<![\\w$.])(?:profile|engineProfile|cachedEngineProfile))\\.${k}\\b(?!\\s*=[^=])`,
      'g',
    )
    src = src.replace(re, () => {
      n++
      foldedKeys.add(k)
      return JSON.stringify(v)
    })
  }
  // `scan` parameters carry profile.lineBreakScan
  src = src.replace(/\bscan (===|!==) '(\w+)'/g, (_, op, e) => {
    n++
    return `'${engine}' ${op} '${e}'`
  })
  return { src, n }
}

// Modules layout() runs: never split by coverage, since layout must not throw.
const LAYOUT_TIME = new Set([
  'line-break.ts',
  'line-break-complex.ts',
  'line-break-complex-state.ts',
  'line-break-simple.ts',
  'line-break-geometry.ts',
  'layout.ts',
  'line-text.ts',
  'graphemes.ts',
])
// Called by the specialiser's own code or the provider.
const KEEP = new Set([
  '__resetEngineData',
  'installEngineData',
  'getEngineProfile',
  'clearMeasurementCaches',
  'setLocaleLanguage',
  'clearWordSegmenter',
  'clearCache',
  'setLocale',
])
// These caches are owned by the modules that read the installed engine tables.
const RESETS = {
  'line-breaks.ts':
    'classRuns = null; classRemaps = null; for (const k in breakRules) delete (breakRules as Record<string, unknown>)[k]; webkitLineRules.clear()',
  'graphemes.ts':
    'for (const k in graphemeRules) delete (graphemeRules as Record<string, unknown>)[k]',
  'prepare-script.ts': 'scriptClasses = null',
  'gecko-line-breaks-transform.ts': 'eastAsianWidths = null',
  'gecko-line-breaks.ts': 'lineData = null',
}

export async function specialize(engine, { useCoverage = true } = {}) {
  const covFile = path.join(root, 'src/coverage', `${engine}.json`)
  const rare =
    useCoverage && fs.existsSync(covFile)
      ? new Set(JSON.parse(fs.readFileSync(covFile, 'utf8')).ran)
      : null
  const out = path.join(root, 'gen', engine)
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(path.join(out, 'generated'), { recursive: true })
  const { profile } = readProfile(engine)
  foldedKeys.clear()
  const { packFiles, folds, foundMoves } = writeModules(engine, profile, rare, out)
  // An upstream bump that renames a moved function or drops a profile field must fail here, not ship.
  for (const [pack, mods] of Object.entries(MOVES))
    for (const [mf, fns] of Object.entries(mods))
      for (const fn of fns) {
        if (pack === 'families' && engine !== 'webkit') continue
        if (!foundMoves.has(mf + ':' + fn))
          throw new Error(`${engine}: ${pack} move ${mf}:${fn} not found upstream`)
      }
  // rich-inline.ts is not built (weft doesn't use it); fields only it reads are fine
  const rich = fs.readFileSync(path.join(vendor, 'rich-inline.ts'), 'utf8')
  const unfolded = Object.keys(profile).filter(
    (k) => !foldedKeys.has(k) && !new RegExp(`\\.${k}\\b`).test(rich),
  )
  if (unfolded.length)
    throw new Error(
      `${engine}: profile fields never read through profile/engineProfile/getEngineProfile(): ${unfolded.join(', ')}`,
    )
  fs.copyFileSync(
    path.join(vendor, 'generated/webkit-generic-families.ts'),
    path.join(out, 'generated/webkit-generic-families.ts'),
  )
  const baseData = await writeEngineData(engine, out)
  writePackEntries(engine, out, packFiles)
  return { engine, folds, base: baseData.stats, packs: Object.keys(packFiles) }
}

function writePackEntries(engine, out, packFiles) {
  // registry + pack entries
  fs.writeFileSync(
    path.join(out, 'packs.ts'),
    `// specialize.mjs: functions the lazy packs provide, by name.
export const __packs: Record<string, any> = {}
export class PackMissing extends Error {
  constructor(readonly pack: string, fn: string) { super(\`text-engine: "\${pack}" pack not loaded (needed by \${fn})\`) }
}
export function __missing(pack: string, fn: string): never { throw new PackMissing(pack, fn) }
`,
  )
  for (const [pack, list] of Object.entries(packFiles)) {
    if (pack === 'rich') continue
    const lines = [
      `// specialize.mjs: the "${pack}" pack for ${engine}.`,
      `import { __packs } from './packs.js'`,
    ]
    list.forEach((lf, i) => lines.push(`import * as m${i} from './${lf.replace(/\.ts$/, '.js')}'`))
    if (pack === 'scripts') {
      lines.push(
        `import * as full from './generated/engine-break-data.full.js'`,
        `import { installEngineData } from './generated/engine-break-data.js'`,
      )
      for (const f of Object.keys(RESETS))
        lines.push(
          `import { __resetEngineData as r_${f.replace(/\W/g, '_')} } from './${f.replace(/\.ts$/, '.js')}'`,
        )
      lines.push(
        `installEngineData(full)`,
        ...Object.keys(RESETS).map((f) => `r_${f.replace(/\W/g, '_')}()`),
      )
    }
    lines.push(
      `Object.assign(__packs, ${list.map((_, i) => `m${i}`).join(', ') ? list.map((_, i) => `m${i}`).join(', ') : '{}'})`,
    )
    fs.writeFileSync(path.join(out, `pack-${pack}.ts`), lines.join('\n') + '\n')
  }
  // gecko has no families pack; give every engine the same pack names
  for (const pack of ['complex', 'scripts', 'spacing', 'families', 'rare'])
    if (!fs.existsSync(path.join(out, `pack-${pack}.ts`)))
      fs.writeFileSync(
        path.join(out, `pack-${pack}.ts`),
        `// specialize.mjs: nothing to load for ${engine}.\nexport {}\n`,
      )
}

async function writeEngineData(engine, out) {
  // 2. engine data: base (restricted, mutable) + full (installed by the scripts pack)
  const typesHead = fs
    .readFileSync(path.join(vendor, 'generated/engine-break-data.ts'), 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('export type'))
    .join('\n')
  const baseData = await genEngineData({ upstreamDir: vendor, engine, alphabet: ALPHABET })
  const fullData = await genEngineData({ upstreamDir: vendor, engine, alphabet: null })
  const names = [...baseData.src.matchAll(/^export const (\w+)/gm)].map((m) => m[1])
  fs.writeFileSync(
    path.join(out, 'generated/engine-break-data.ts'),
    [
      typesHead,
      "// The base alphabet's tables. `let`, so installEngineData() can swap in the full ones; ES module",
      '// bindings are live, so every reader sees the swap.',
      baseData.src.replace(/^export const (\w+) =/gm, (_, n) => `export let ${n}: any =`),
      `export function installEngineData(d: any): void { ${names.map((n) => `${n} = d.${n}`).join('; ')} }`,
    ].join('\n') + '\n',
  )
  fs.writeFileSync(path.join(out, 'generated/engine-break-data.full.ts'), fullData.src)
  return baseData
}

function writeModules(engine, profile, rare, out) {
  const files = fs.readdirSync(vendor).filter((f) => f.endsWith('.ts') && f !== 'rich-inline.ts')
  const packFiles = {} // pack -> [file]
  const folds = { count: 0 }
  const foundMoves = new Set()
  for (const f of files) {
    const { src, moves } = prepareModule(f, engine, profile, rare, folds, foundMoves)
    const { base, lazy } = moveFunctions(f, src, moves)
    fs.writeFileSync(path.join(out, f), base)
    for (const [pack, text] of Object.entries(lazy)) {
      const lf = f.replace(/\.ts$/, `.${pack}.ts`)
      fs.writeFileSync(path.join(out, lf), text)
      ;(packFiles[pack] ??= []).push(lf)
    }
  }
  return { packFiles, folds: folds.count, foundMoves }
}

function prepareModule(f, engine, profile, rare, folds, foundMoves) {
  let src = fs.readFileSync(path.join(vendor, f), 'utf8')
  if (f === 'line-break-complex.ts') {
    const state = fs.readFileSync(path.join(vendor, 'line-break-complex-state.ts'), 'utf8')
    src = inlineWalker(src, state)
  }
  const r = foldProfile(src, engine, profile)
  src = r.src
  folds.count += r.n
  if (f === 'measurement-engine.ts') {
    // Every profile field is folded at its reads, so the profile object is never read: build an empty one.
    src = src.replace(
      /function buildEngineProfile\(\): EngineProfile \{[\s\S]*?\n\}\n/,
      engine === 'webkit'
        ? `function buildEngineProfile(): EngineProfile {\n  return { namesGenericFamiliesByLanguage: !/^(?:Linux|Win32|Haiku|$)/.test(navigator.platform) } as EngineProfile\n}\n`
        : `function buildEngineProfile(): EngineProfile {\n  return {} as EngineProfile\n}\n`,
    )
  }
  if (f === 'measurement.ts') {
    if (engine === 'webkit') {
      // Resolve the language's generic families on the first font string that names a generic keyword,
      // not on the first measurement: getCanvasFont returns a font without one unchanged, so this is the
      // same answer, and Latin pages whose fonts name families never load the families pack.
      const a =
        'genericFamilies: language !== null && profile.namesGenericFamiliesByLanguage ? getWebKitGenericFamilies(language, context) : null,'
      if (!src.includes(a)) throw new Error('webkit families patch: anchor missing')
      src = src.replace(
        a,
        'genericFamilies: language !== null && profile.namesGenericFamiliesByLanguage ? (undefined as unknown as string[]) : null,',
      )
      const b =
        'const canvasFont = state.genericFamilies === null ? font : getCanvasFont(font, state.genericFamilies)'
      if (!src.includes(b)) throw new Error('webkit families patch: anchor 2 missing')
      src = src.replace(
        b,
        'const canvasFont = state.genericFamilies === null || !genericKeywordRe.test(font) ? font : getCanvasFont(font, state.genericFamilies ??= getWebKitGenericFamilies(state.language!, state.context))',
      )
      src += `\n// specialize.mjs: a superset test for genericKeywords (getCanvasFont decides exactly).\nexport const genericKeywordRe = new RegExp('(?:^|[\\\\s,])(?:' + genericKeywords.join('|') + ')\\\\s*(?:,|$)', 'i')\n`
    }
  }
  // reset hooks for caches over engine data, called when the scripts pack installs the full tables
  if (RESETS[f])
    src += `\n// specialize.mjs: drop what was unpacked from the base tables once the full tables are installed.\nexport function __resetEngineData(): void { ${RESETS[f]} }\n`
  const moves = {}
  for (const [pack, mods] of Object.entries(MOVES)) for (const fn of mods[f] ?? []) moves[fn] = pack
  // coverage-guided: prepare-time functions that never ran on in-alphabet text go to "rare"
  if (rare && !LAYOUT_TIME.has(f)) {
    for (const st of ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true).statements) {
      if (
        ts.isFunctionDeclaration(st) &&
        st.name &&
        st.body &&
        upstreamFunctions.get(SPLIT_ORIGINS[f] ?? f)?.has(st.name.text) &&
        !rare.has(st.name.text) &&
        !moves[st.name.text] &&
        !KEEP.has(st.name.text)
      )
        moves[st.name.text] = 'rare'
    }
  }
  if (engine !== 'webkit') delete moves.getWebKitGenericFamilies
  for (const st of ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true).statements)
    if (ts.isFunctionDeclaration(st) && st.name && moves[st.name.text])
      foundMoves.add(f + ':' + st.name.text)
  return { src, moves }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = process.argv.slice(2).filter((a) => a.startsWith('--'))
  const list = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const engines = list.length ? list : ['blink', 'webkit', 'gecko']
  for (const e of engines) {
    const r = await specialize(e, { useCoverage: !flags.includes('--no-rare') })
    console.log(`${e}: ${r.folds} profile reads folded; packs: ${r.packs.join(', ')}`)
  }
}
