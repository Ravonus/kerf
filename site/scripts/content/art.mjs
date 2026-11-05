import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { catalog } from '../../../packages/cli/src/catalog.mjs'
import { loadCompiler, resolveWeft } from '../../../packages/cli/src/weft.mjs'
import { highlight, level, PALETTE, site, repo, pub } from './context.mjs'
import { write, readData } from './docs-catalog.mjs'

/** Every drawing, from the set's generated source: `{ name: [hollow, solid] }`, content-addressed in `public/`. */
function buildIcons() {
  const icons = join(repo, 'packages/warp-icons/src/gen')
  const entry = readFileSync(join(icons, 'all.tsx'), 'utf8')
  const source = [...entry.matchAll(/^export \* from '(\.\/all-[^']+)'$/gm)]
    .map(([, path]) => readFileSync(join(icons, `${path}.tsx`), 'utf8'))
    .join('\n')
  const names = JSON.parse(
    /names = (\[[^\]]*\])/.exec(
      readFileSync(join(repo, 'packages/warp-icons/src/gen/names.ts'), 'utf8'),
    )[1],
  )
  const title = (n) => n.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase())
  const drawn = new Map()
  for (const [, id, one, two] of source.matchAll(
    /^export const (\w+) = \/\*#__PURE__\*\/ icon\('([^']*)'(?:,\s*'([^']*)')?\)/gm,
  ))
    drawn.set(id, one + (two ?? ''))
  const set = Object.fromEntries(
    names.map((n) => [n, [drawn.get(`${title(n)}Icon`), drawn.get(`${title(n)}IconSolid`)]]),
  )
  const missing = names.filter((n) => !set[n][0] || !set[n][1])
  if (missing.length) throw new Error(`icons without both forms: ${missing.join(' ')}`)
  const text = JSON.stringify(set)
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 10)
  writeFileSync(join(pub, 'search', `icons.${hash}.json`), text)
  write('icons.json', { url: `/search/icons.${hash}.json`, names })
  return names.map((n) => ({ title: n, url: `/icons?q=${n}`, group: 'Icons', rank: 0.3 }))
}

// ------------------------------------------------------------------ art

/** A palette PNG, by hand: the poster is a few KB of cells, sized up with `image-rendering: pixelated`. */
/** The share card's picture: the hero's field, fading out towards the words, with the mark woven on it. 10 px cells. */
function cardArt() {
  const cols = 120,
    rows = 63,
    CELL = 10
  const unit = 2.4,
    ox = 62,
    oy = 3
  const warps = [5, 10, 15, 20].map((u) => ox + u * unit),
    wefts = [9, 15].map((u) => oy + u * unit)
  const near = (v, at) => Math.abs(v + 0.5 - at) <= 1.5
  const cell = (x, y) => {
    const warp = warps.findIndex((at) => near(x, at)),
      weft = wefts.findIndex((at) => near(y, at))
    const inWarp = warp >= 0 && y >= oy + 3 * unit && y < oy + 21 * unit
    const inWeft = weft >= 0 && x >= ox + 2 * unit && x < ox + 22 * unit
    if (inWarp && (!inWeft || (warp + weft) % 2 === 1)) return 4
    if (inWeft) return 6
    return level(x, y, cols, rows, 0, -0.75 * (1 - Math.min(1, x / cols / 0.72)) ** 1.2 * 1.4)
  }
  return png(
    cols * CELL,
    rows * CELL,
    (x, y) => Math.max(0, cell((x / CELL) | 0, (y / CELL) | 0)),
    [...PALETTE, [250, 120, 90, 255]],
  )
}

function png(width, height, pixel, palette) {
  const crcTable = Int32Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c
  })
  const crc = (buf) => {
    let c = -1
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc(body))
    return Buffer.concat([head, body, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 3
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = pixel(x, y)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(palette.flatMap((c) => c.slice(0, 3)))),
    chunk('tRNS', Buffer.from(palette.map((c) => c[3]))),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

function buildArt() {
  mkdirSync(join(pub, 'art'), { recursive: true })
  writeFileSync(
    join(pub, 'art/field.png'),
    png(160, 100, (x, y) => level(x, y, 160, 100, 0), PALETTE),
  )
  write('card-art.json', { src: `data:image/png;base64,${cardArt().toString('base64')}` })
  // A band that dissolves from solid to nothing: the site's divider.
  writeFileSync(
    join(pub, 'art/band.png'),
    png(64, 12, (x, y) => (y / 12 < BAYER4[(y & 3) * 4 + (x & 3)] / 16 ? 1 : 0), [
      [0, 0, 0, 0],
      [46, 176, 104, 255],
    ]),
  )
}

/** The landing's code moment and diagnostic, from the real compiler. */
function buildShowcase() {
  const compiler = loadCompiler(resolveWeft(site))
  const source = `import { state } from '@weft-js/core'

export function Counter() {
  const n = state(0)
  return <button onClick={() => n.value++}>{n.value}</button>
}`
  const compiled = compiler.transform(source, { filename: 'Counter.tsx' }).code.trim()
  const bad = `function Total(props: { count: number }) {
  const total = props.count * 5
  return <b>{total}</b>
}`
  const report = compiler
    .transform(bad, { filename: 'Total.tsx' })
    .diagnostics.find((d) => d.code === 'W001')
  if (!report) throw new Error('the showcase expects W001')
  const entry = catalog.find((e) => e.code === 'W001')
  const good = `function Total(props: { count: number }) {
  const total = derived(() => props.count * 5)
  return <b>{total.value}</b>
}`
  const block = (text, lang) => `<pre tabindex="0"><code>${highlight(text, lang)}</code></pre>`
  const unquoted = (s) => s.replaceAll('`', '') // the compiler's words, without the terminal's quoting
  const marked = (text, lines) => {
    let n = -1
    return `<pre tabindex="0"><code>${highlight(text, 'tsx').replace(
      /<span data-part="line"[^>]*>/g,
      (tag) => {
        n++
        return lines[n] ? tag.replace('>', ` data-${lines[n]}="">`) : tag
      },
    )}</code></pre>`
  }
  const diff = `function Total(props: { count: number }) {
  const total = props.count * 5
  const total = derived(() => props.count * 5)
  return <b>{total}</b>
  return <b>{total.value}</b>
}`
  const habit = compiler
    .transform(
      `import { state } from '@weft-js/core'\nfunction Price(props: { value: number }) {\n  const n = state(props.value)\n  return <b>{n.value}</b>\n}`,
      { filename: 'Price.tsx' },
    )
    .diagnostics.find((d) => d.code === 'W005')
  if (!habit) throw new Error('the showcase expects W005')
  const server = `// src/server/shop.ts
export const products = query({
  tags: ['products'],
  run: ({ ctx }) => ctx.db.select().from(schema.products),
})

// in Shop: the list now comes from the database
const list = products()
{(list.value ?? []).map(p => <Row key={p.id} product={p} />)}`
  const size = readData('evals/results/summary.json').warpExit.size
  const kb = (n) => +(n / 1024).toFixed(2)
  write('showcase.json', {
    receipt: { weft: kb(size.weft.js), kit: kb(size.kit), total: kb(size.weft.js + size.kit) },
    server: block(server, 'tsx'),
    habit: {
      code: 'W005',
      message: unquoted(habit.message),
      fix: unquoted(habit.help ?? catalog.find((e) => e.code === 'W005').fix),
    },
    source: block(source, 'tsx'),
    compiled: block(compiled, 'ts'),
    bad: marked(bad, { 1: 'bad' }),
    good: block(good, 'tsx'),
    diff: marked(diff, { 1: 'del', 2: 'add', 3: 'del', 4: 'add' }),
    code: 'W001',
    message: unquoted(report.message),
    file: `Total.tsx, line ${report.line}`,
    fix: unquoted(entry.fix),
  })
}

/** The arena's table: benchmarks/speed's numbers whichever way they fall, including the rows weft loses. */
function buildSpeed() {
  const run = readData('benchmarks/speed/results.json')
  if (!run.valid) throw new Error('benchmarks/speed/results.json was measured under too much load')
  const rows = [
    ['Create 1,000 rows', 'rows total', 'create'],
    ['Replace 1,000 rows', 'rows total', 'replace'],
    ['Create 10,000 rows', 'rows total', 'runLots'],
    ['Append 1,000 rows', 'rows total', 'append'],
    ['Update every 10th row', 'rows total', 'update'],
    ['Select a row', 'rows total', 'select'],
    ['Swap two rows', 'rows total', 'swap'],
    ['Remove a row', 'rows total', 'remove'],
    ['Clear all rows', 'rows total', 'clear'],
    ['Update one cell of 10,000', 'update 10000', 'one cell, ms per tick'],
    ['Update every 10th of 10,000', 'update 10000', 'every 10th, ms per tick'],
    ['Update all 10,000 cells', 'update 10000', 'every cell, ms per tick'],
  ].map(([label, group, key]) => {
    const [weft, solid, react] = ['weft', 'solid-batch', 'react'].map(
      (s) => run.grid[s][group][key],
    )
    // Across the rounds: a row only goes to whoever's 95% interval against the other stays on one side of even.
    const { lo, hi } = run.compared.weft[group][key]
    return { label, weft, solid, react, fastest: hi < 1 ? 'weft' : lo > 1 ? 'Solid' : 'Too close' }
  })
  const arena = readData('benchmarks/speed/arena-site.json')
  write('speed.json', {
    arena,
    machine: run.machine,
    solid: run.solid,
    when: run.when.slice(0, 10),
    rows,
    wins: rows.filter((r) => r.fastest === 'weft').length,
    losses: rows.filter((r) => r.fastest === 'Solid').length,
  })
}

// ------------------------------------------------------------------ agents

function buildLlms(docs, learn) {
  const lines = [
    '# weft',
    '',
    '> TSX compiled to direct DOM bindings, with warp, its UI toolkit, and a compiler that explains errors to agents.',
    '',
    'Every Learn and Reference page has a Markdown twin: add `.md` to its URL. `weft docs <topic>` prints the Reference text.',
    '',
  ]
  for (const [base, nav] of [
    ['learn', learn.nav],
    ['reference', docs.nav],
  ]) {
    for (const { section, items } of nav) {
      lines.push(`## ${base === 'learn' ? 'Learn' : 'Reference'}: ${section}`, '')
      for (const i of items) lines.push(`- [${i.title}](/${base}/${i.slug}.md)`)
      lines.push('')
    }
  }
  lines.push(
    '## Files',
    '',
    '- [All of Learn and Reference in one file](/llms-full.txt)',
    '- [Every title on the site](/search.json)',
    '',
  )
  writeFileSync(join(pub, 'llms.txt'), lines.join('\n'))
  writeFileSync(
    join(pub, 'llms-full.txt'),
    [...learn.flat, ...docs.flat].map((p) => p.md).join('\n\n---\n\n'),
  )
}

export { buildIcons, buildArt, buildShowcase, buildSpeed, buildLlms }
