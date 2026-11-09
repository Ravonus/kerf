// Splits the finished warp CSS (docs/design/warp/tokens) into one file per component, so importing one component
// ships only its own rules. Nothing is restyled: every rule is copied byte for byte, and a rule's order relative to
// the other rules in its file is the spec's order.
//
//   node scripts/split-css.mjs           write styles/
//   node scripts/split-css.mjs --check   exit 1 if styles/ differs from what the spec would produce
//
// warp.css (tokens, base, signature) ships whole as styles/warp.css. warp-components.css splits at its
// `/* -- Name` headers; warp-inputs.css at its numbered sections. Rules before the first header (sweep tokens, tone
// plumbing) go to the family's base file, which every component in the family imports first. The cross-cutting tail
// sections (reduced motion, forced colours, touch targets) restate rules for many components and must load after
// them, so each of their rules moves to the end of the file that owns the [data-scope] it names.
//
// warp-data.css, warp-layout.css, warp-app.css and warp-flows.css have several @layer blocks and many scopes in sections with no one header style,
// so they split by rule, not by header: a rule goes to `data/<scope>.css` for each scope that opens one of its
// selectors (`[data-scope="table"] [data-scope="field"]` is the table's), an @container or @media block is split the
// same way, and a rule that names no scope goes to the family's base. @keyframes go to each file that animates with
// them. Their tokens layer ships whole as `data/tokens.css`, with any @property the spec declares beside it.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { lowerTheme, themeNames } from './theme-css.mjs'
import { fileURLToPath } from 'node:url'
import { body, scopesOf } from './split-css/parse.mjs'
import { split } from './split-css/sections.mjs'
import { choices } from './split-css/choices.mjs'
import { textFields } from './split-css/text.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const spec = join(root, '../../docs/design/warp/tokens')
const out = join(root, 'styles')

// the scope that opens each selector in a rule's selector list (a compound's later [data-scope] is a descendant)
function homes(rule) {
  const prelude = rule.slice(0, rule.indexOf('{'))
  const pieces = []
  let depth = 0,
    from = 0
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    // a list inside the one outer :where() or :is() separates selectors just as a top-level one does
    else if (c === ',' && depth <= 1) {
      pieces.push(prelude.slice(from, i))
      from = i + 1
    }
  }
  pieces.push(prelude.slice(from))
  const scopes = new Set()
  for (const p of pieces) {
    const m = p.match(/data-scope="([\w-]+)"/)
    scopes.add(m ? m[1] : 'base')
  }
  return [...scopes]
}

/** One rule-routed family: `tokens` (the tokens blocks whole) and a file per scope. */
function route(file, family, css = readFileSync(join(spec, file), 'utf8')) {
  const files = new Map(),
    tokens = [],
    frames = []
  const add = (home, entry) => {
    if (!files.has(home)) files.set(home, [])
    files.get(home).push(entry)
  }
  const property = [...css.matchAll(/^@property [^\n]*\n/gm)].map((m) => m[0]).join('')
  for (const m of css.matchAll(/^@layer ([\w.]+) \{/gm)) {
    const { list } = body(css, m.index + m[0].length)
    if (m[1] === 'warp.tokens') {
      tokens.push(
        list
          .map((i) => i.text)
          .join('')
          .trim(),
      )
      continue
    }
    let notes = []
    for (const item of list) {
      if (item.kind !== 'rule') {
        if (item.kind === 'comment' && !/^\/\*\s*[-=]{6,}/.test(item.text)) notes.push(item.text)
        continue
      }
      const before = notes
      notes = []
      if (item.text.startsWith('@keyframes')) {
        frames.push(item)
        continue
      }
      if (/^@(media|container|supports)/.test(item.text)) {
        const open = item.text.indexOf('{') + 1
        const byHome = new Map()
        for (const i of body(item.text, open).list)
          if (i.kind === 'rule') {
            if (i.text.startsWith('@keyframes')) {
              frames.push(i)
              continue
            }
            for (const h of homes(
              i.text.startsWith('@') ? i.text.slice(i.text.indexOf('{') + 1) : i.text,
            ))
              (byHome.get(h) ?? byHome.set(h, []).get(h)).push(i.text)
          }
        for (const [h, inner] of byHome)
          add(h, {
            text: `${before.join('\n')}\n${item.text.slice(0, open)}\n${inner.join('\n')}\n}`.trimStart(),
            inner,
          })
      } else
        for (const h of homes(item.text))
          add(h, { text: `${before.join('\n')}\n${item.text}`.trimStart(), inner: [item.text] })
    }
  }
  // a keyframe rides with the files that name it; one nobody here names (warp.css or an app may) stays in base
  for (const f of frames) {
    const name = f.text.match(/@keyframes\s+([\w-]+)/)[1]
    const using = [...files]
      .filter(([, list]) => list.some((e) => new RegExp(`\\b${name}\\b`).test(e.text)))
      .map(([h]) => h)
    for (const h of using.length ? using : ['base']) add(h, { text: f.text, inner: [f.text] })
  }
  return {
    family,
    files,
    tokens: [
      `@layer warp.tokens {\n${tokens.join('\n')}\n}`,
      ...(property ? [property.trim()] : []),
    ].join('\n'),
    layer: `warp.${family}`,
  }
}

function renderRouted({ family, files, tokens, layer }) {
  const head =
    '/* generated from docs/design/warp/tokens by warp-core/scripts/split-css.mjs: do not edit */\n'
  const result = new Map([[`${family}/tokens.css`, `${head}${tokens}\n`]])
  for (const [name, list] of files)
    result.set(
      `${family}/${name}.css`,
      `${head}@layer ${layer} {\n${list.map((e) => e.text).join('\n')}\n}\n`,
    )
  return result
}

function render({ layer, family, files, shared }) {
  const result = new Map()
  for (const [name, list] of files) {
    const joined = list
      .map((i) => i.text)
      .join('')
      .trim()
    if (!list.some((i) => i.kind === 'rule')) continue
    result.set(
      `${family}/${name}.css`,
      `/* generated from docs/design/warp/tokens by warp-core/scripts/split-css.mjs: do not edit */\n@layer ${layer} {\n${joined}\n}\n`,
    )
  }
  // cross-cutting tail rules no single component owns load once, from the family base, after its own rules
  const tail = shared
    .map((i) => i.text)
    .join('')
    .trim()
  if (tail)
    result.set(
      `${family}/tail.css`,
      `/* generated from docs/design/warp/tokens by warp-core/scripts/split-css.mjs: do not edit */\n@layer ${layer} {\n${tail}\n}\n`,
    )
  return result
}

export function build() {
  const foundation = readFileSync(join(spec, 'warp.css'), 'utf8')
  const files = new Map([['warp.css', lowerTheme(foundation, themeNames)]])
  if (files.get('warp.css') !== foundation) files.set('themed/warp.css', foundation)
  const canonical = readFileSync(join(spec, 'warp-components.css'), 'utf8')
  const themed = split(spec, 'warp-components.css', 'components')
  const temporary = mkdtempSync(join(tmpdir(), 'warp-lower-'))
  let components
  try {
    writeFileSync(join(temporary, 'warp-components.css'), lowerTheme(canonical, themeNames))
    components = split(temporary, 'warp-components.css', 'components')
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
  const parts = {
    components,
    inputs: split(spec, 'warp-inputs.css', 'inputs'),
    rich: split(spec, 'warp-inputs-rich.css', 'rich'),
  }
  for (const p of Object.values(parts)) for (const [k, v] of render(p)) files.set(k, v)
  const choiceFiles = choices(parts.inputs.files.get('choice'))
  for (const [k, v] of render({ ...parts.inputs, files: choiceFiles, shared: [] })) files.set(k, v)
  const textFiles = new Map([['text-field', textFields(parts.inputs.files.get('text'))]])
  for (const [k, v] of render({ ...parts.inputs, files: textFiles, shared: [] })) files.set(k, v)
  const themedData = route('warp-data.css', 'data')
  const dataCss = readFileSync(join(spec, 'warp-data.css'), 'utf8')
  const routed = {
    data: route('warp-data.css', 'data', lowerTheme(dataCss, themeNames)),
    layout: route('warp-layout.css', 'layout'),
    app: route('warp-app.css', 'app'),
    flows: route('warp-flows.css', 'flows'),
    canvas: route('warp-canvas.css', 'canvas'),
  }
  for (const p of Object.values(routed))
    for (const [k, v] of renderRouted(p)) if (k !== 'canvas/tokens.css') files.set(k, v) // canvas has no tokens
  const scopes = {}
  for (const p of Object.values(routed))
    for (const name of p.files.keys())
      if (name !== 'base') (scopes[name] ??= new Set()).add(`${p.family}/${name}.css`)
  for (const p of Object.values(parts))
    for (const [name, list] of p.files)
      for (const i of list)
        if (i.kind === 'rule')
          for (const s of scopesOf(i.text)) (scopes[s] ??= new Set()).add(`${p.family}/${name}.css`)
  files.set(
    'manifest.json',
    JSON.stringify(
      Object.fromEntries(
        Object.entries(scopes)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, [...v]]),
      ),
      null,
      1,
    ) + '\n',
  )
  for (const [path, content] of renderRouted(themedData)) {
    if (files.get(path) !== content) files.set(`themed/${path}`, content)
  }
  for (const [path, content] of render(themed)) {
    if (files.get(path) !== content) files.set(`themed/${path}`, content)
  }
  return { files, parts, routed }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files } = build()
  const read = (dir) =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => join(d.parentPath, d.name))
  if (process.argv.includes('--check')) {
    const stale = []
    try {
      for (const [k, v] of files) if (readFileSync(join(out, k), 'utf8') !== v) stale.push(k)
    } catch (e) {
      stale.push(e.path)
    }
    const extra = read(out)
      .map((p) => p.slice(out.length + 1))
      .filter((p) => !files.has(p))
    if (stale.length || extra.length) {
      console.error(
        `styles/ is stale (${[...stale, ...extra].join(', ')}): run node scripts/split-css.mjs`,
      )
      process.exit(1)
    }
  } else {
    rmSync(out, { recursive: true, force: true })
    for (const [k, v] of files) {
      mkdirSync(dirname(join(out, k)), { recursive: true })
      writeFileSync(join(out, k), v)
    }
    console.log(`wrote ${files.size} files to styles/`)
  }
}
