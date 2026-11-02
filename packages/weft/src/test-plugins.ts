// weft/test/plugins: conformance suites that ship with a slot, so any provider can be held to them (research 13 §2.11).
// `textMeasureSuite` runs in a page, against real layout: a test double can't show a line count is right. A runner loads
// it in each pinned browser (packages/text/test/conformance.mjs).

import type { MeasureProvider } from './surface'

export interface Check { name: string; ok: boolean; detail: string }

export interface Corpus {
  name: string
  texts: string[]
  /** Share of height mismatches allowed: 0 for Latin, emoji and Arabic, 0.005 for CJK (research 11 §8.4). */
  allow?: number
}

export interface MeasureSuiteOptions {
  corpora: Corpus[]
  /** A family installed everywhere. Default Arial. */
  family?: string
  size?: number
  lineHeight?: number
  widths?: number[]
  /** A web font not yet loaded: `layout` must match the DOM in it after `clear()`. */
  webFont?: { family: string; url: string }
  /** Budgets in ms over 1k paragraphs. Pass larger ones on a loaded machine. */
  budgets?: { layout?: number; prepare?: number }
}


/** Run `fn` with layout-forcing DOM reads throwing. */
function pure<T>(fn: () => T): T {
  const undo: (() => void)[] = []
  const forbid = (name: string) => () => { throw new Error(`layout-forcing read: ${name}`) }
  for (const [proto, key] of [[HTMLElement.prototype, 'offsetHeight'], [HTMLElement.prototype, 'offsetWidth'], [Element.prototype, 'clientHeight'], [Element.prototype, 'scrollHeight']] as [any, string][]) {
    const d = Object.getOwnPropertyDescriptor(proto, key)!
    Object.defineProperty(proto, key, { ...d, get: forbid(key) })
    undo.push(() => Object.defineProperty(proto, key, d))
  }
  for (const [host, key] of [[Element.prototype, 'getBoundingClientRect'], [Element.prototype, 'getClientRects'], [window, 'getComputedStyle']] as [any, string][]) {
    const f = host[key]
    host[key] = forbid(key)
    undo.push(() => { host[key] = f })
  }
  try { return fn() } finally { for (const u of undo) u() }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]

/** One Check per requirement of `text.measure@1`. Any `ok: false` is P119. */
export async function textMeasureSuite(p: MeasureProvider, o: MeasureSuiteOptions): Promise<Check[]> {
  const family = o.family ?? 'Arial', size = o.size ?? 16, lineHeight = o.lineHeight ?? 24, widths = o.widths ?? [320, 480]
  const font = `${size}px ${family}`
  const out: Check[] = []

  const box = document.body.appendChild(document.createElement('div'))
  box.style.cssText = `position:absolute;visibility:hidden;font:${font};line-height:${lineHeight}px;white-space:normal;overflow-wrap:break-word`
  const dom = (texts: string[], width: number, face = font) => {
    box.style.width = `${width}px`
    box.style.font = face
    box.style.lineHeight = `${lineHeight}px`
    box.replaceChildren(...texts.map(t => Object.assign(document.createElement('div'), { textContent: t })))
    return [...box.children].map(c => c.getBoundingClientRect().height)
  }
  const prepared = async (texts: string[], face = font, opts?: { segments?: boolean }) => {
    const hs = texts.map(t => p.prepare(t, face, opts))
    await Promise.all(hs.map(h => h.ready))
    return hs
  }

  for (const corpus of o.corpora) {
    const hs = await prepared(corpus.texts)
    let wrong = 0, total = 0, example = ''
    for (const w of widths) {
      const real = dom(corpus.texts, w)
      for (let i = 0; i < hs.length; i++) {
        total++
        const got = p.layout(hs[i], w, lineHeight).height
        if (Math.abs(got - real[i]) > 0.5) { wrong++; example ||= `#${i} at ${w}px: ${got} vs DOM ${real[i]}` }
      }
    }
    const allow = corpus.allow ?? 0
    out.push({ name: `accuracy: ${corpus.name}`, ok: wrong / total <= allow, detail: `${wrong}/${total} heights differ from the DOM (allowed ${(allow * 100).toFixed(1)}%)${example ? `; ${example}` : ''}` })
  }

  const first = o.corpora[0].texts
  const lined = await prepared(first, font, { segments: true })
  let broken = ''
  for (let i = 0; i < lined.length && !broken; i++) {
    const w = widths[0]
    const lines = p.lines(lined[i], w)
    const count = p.layout(lined[i], w, lineHeight).lineCount
    const text = lines.map(l => p.lineText(lined[i], l)).join(' ').replace(/\s+/g, '')
    if (lines.length !== count) broken = `#${i}: ${lines.length} lines, layout says ${count}`
    else if (text !== first[i].replace(/\s+/g, '')) broken = `#${i}: the lines' text isn't the paragraph's`
  }
  out.push({ name: 'lines: agree with layout, and lineText returns the text', ok: !broken, detail: broken || `${lined.length} paragraphs` })

  const hs = await prepared(first)
  let impure = ''
  try { pure(() => { for (const h of hs) p.layout(h, widths[0], lineHeight) }) } catch (e) { impure = String((e as Error).message) }
  out.push({ name: 'purity: layout reads no DOM', ok: !impure, detail: impure || 'no layout-forcing read' })

  const per1k = (n: number, ms: number) => (ms * 1000) / n
  const layoutMs: number[] = [], prepareMs: number[] = []
  for (let r = 0; r < 9; r++) {
    const t0 = performance.now()
    for (const h of hs) p.layout(h, widths[1] ?? widths[0], lineHeight)
    layoutMs.push(per1k(hs.length, performance.now() - t0))
    const t1 = performance.now()
    for (const t of first) p.prepare(t, font)
    prepareMs.push(per1k(first.length, performance.now() - t1))
  }
  const layoutBudget = o.budgets?.layout ?? 0.5, prepareBudget = o.budgets?.prepare ?? 15
  out.push({ name: 'speed: layout', ok: median(layoutMs) <= layoutBudget, detail: `${median(layoutMs).toFixed(3)} ms per 1k (≤ ${layoutBudget})` })
  out.push({ name: 'speed: prepare', ok: median(prepareMs) <= prepareBudget, detail: `${median(prepareMs).toFixed(2)} ms per 1k, widths cached (≤ ${prepareBudget})` })

  if (o.webFont) {
    const face = `${size}px "${o.webFont.family}"`
    const stale = await prepared(first, face)
    const before = stale.map(h => p.layout(h, widths[0], lineHeight).height)
    const f = new FontFace(o.webFont.family, `url(${o.webFont.url})`)
    document.fonts.add(await f.load())
    p.clear()
    const fresh = await prepared(first, face)
    const real = dom(first, widths[0], face)
    let wrong = 0
    fresh.forEach((h, i) => { if (Math.abs(p.layout(h, widths[0], lineHeight).height - real[i]) > 0.5) wrong++ })
    const moved = before.filter((h, i) => h !== real[i]).length
    out.push({ name: 'fonts: after clear(), results match the real face', ok: wrong === 0 && moved > 0, detail: `${wrong}/${fresh.length} differ from the DOM; the font changed ${moved} heights, so this run could fail` })
  }
  box.remove()
  return out
}

// ---- realtime.bus@1 and db.adapter@1 (agorix 03 §5): plain Node, against a real server where the provider has one ----

const pause = (ms: number) => new Promise(ok => setTimeout(ok, ms))
const settle = async (done: () => boolean, ms = 5000) => {
  for (const end = Date.now() + ms; !done() && Date.now() < end;) await pause(5)
  return done()
}

export interface BusLike {
  readonly name: string
  publish(channel: string, message: string): Promise<void>
  subscribe(channel: string, on: (message: string) => void, gap?: () => void): Promise<() => void>
  close?(): Promise<void>
}

export interface BusSuiteOptions {
  /** Two calls are two instances of the app. */
  make: () => BusLike | Promise<BusLike>
  /** Drop the provider's connections: a server restart. Without it the gap check isn't run. */
  restart?: () => Promise<void>
}

/** One Check per requirement of `realtime.bus@1`. Any `ok: false` is P119. */
export async function busSuite({ make, restart }: BusSuiteOptions): Promise<Check[]> {
  const out: Check[] = []
  const check = (name: string, ok: boolean, detail = '') => void out.push({ name, ok, detail })
  const a = await make(), b = await make()
  const room = (s: string) => `weft:c:conform-${Date.now()}-${s}:{"room":"a*b> c é"}`
  try {
    {
      const got: string[] = []
      let gaps = 0
      const c = room('cross')
      const off = await a.subscribe(c, m => got.push(m), () => gaps++)
      await b.publish(c, 'one') // straight after `subscribe` resolves: it means listening
      check('a publish after `subscribe` resolves arrives on the other instance', await settle(() => got.length === 1), `${got.length} messages`)
      check('a first connect is not a gap', gaps === 0, `${gaps} gaps`)
      await pause(100)
      check('a message arrives once', got.length === 1, `${got.length} deliveries`)
      for (let i = 0; i < 200; i++) await b.publish(c, `m${i}`)
      await settle(() => got.length === 201)
      check('messages from one publisher stay in order', got.slice(1).every((m, i) => m === `m${i}`) && got.length === 201, `${got.length} of 201`)
      off()
      await b.publish(c, 'late')
      await pause(100)
      check('nothing arrives after the stop', got.at(-1) !== 'late', got.at(-1) ?? '')
    }
    {
      const got: string[] = [], c = room('apart'), big = `é${'x'.repeat(200_000)}"\n`
      await a.subscribe(c, m => got.push(m))
      await b.publish(room('other'), 'not here')
      await b.publish(c, big)
      await settle(() => got.length > 0)
      check('channels are separate, and a large message survives byte for byte', got.length === 1 && got[0] === big, `${got.length} messages`)
    }
    {
      const c = room('both'), first: string[] = [], second: string[] = []
      const off = await a.subscribe(c, m => first.push(m))
      await a.subscribe(c, m => second.push(m))
      off()
      await b.publish(c, 'x')
      check('stopping one listener leaves the other on the channel', await settle(() => second.length === 1) && !first.length, `${second.length} / ${first.length}`)
    }
    if (restart) {
      const c = room('gap'), got: string[] = []
      let gaps = 0
      await a.subscribe(c, m => got.push(m), () => gaps++)
      await restart()
      check('a dropped connection is a gap', await settle(() => gaps > 0, 15_000), `${gaps} gaps`)
      const ok = await settle(() => { void b.publish(c, 'after').catch(() => {}); return got.length > 0 }, 15_000)
      check('delivery resumes after a gap', ok, `${got.length} messages`)
    }
  } finally {
    await a.close?.().catch(() => {})
    await b.close?.().catch(() => {})
  }
  return out
}

export interface SourceLike {
  list(params: any): Promise<{ items: any[]; total?: number; next?: string | number; prev?: string | number }>
  get(id: unknown): Promise<any>
  create(data: Record<string, unknown>): Promise<any>
  update(id: unknown, patch: Record<string, unknown>): Promise<any>
  remove(id: unknown): Promise<boolean>
  readonly limits?: { page?: false; search?: 'prefix' | 'cased' | false; sort?: readonly string[] }
}

export interface ListRow { id: string; title: string; status: string; rank: number }

/** The rows a source under test starts with. `secret` exists in storage and is left out of its `columns`. */
export const LIST_ROWS: (ListRow & { secret: string })[] = Array.from({ length: 25 }, (_, i) => ({
  id: `t${String(i).padStart(2, '0')}`,
  title: `${i % 5 === 0 ? 'Alpha' : 'beta'} ${i}${i === 7 ? ' 100%_done' : ''}`,
  status: ['open', 'done', 'held'][i % 3],
  rank: i % 4, // ties on purpose: a cursor has to hold across them
  secret: 'never returned',
}))

export interface ListSuiteOptions {
  /** A source over `LIST_ROWS`, written fresh. `columns` are `id`, `title`, `status`, `rank`; search covers `title`. */
  make: () => SourceLike | Promise<SourceLike>
  decode: (cursor: string) => [unknown, unknown] | null
}

const listParams = (p: Record<string, unknown>) => ({ mode: 'page', limit: 10, offset: 0, after: null, sort: null, filter: {}, ...p })

/** One Check per requirement of `db.adapter@1`. Runs over `limits`, so a source says what it can't do. Any `ok: false` is P119. */
export async function listSuite({ make, decode }: ListSuiteOptions): Promise<Check[]> {
  const out: Check[] = []
  const check = (name: string, ok: boolean, detail = '') => void out.push({ name, ok, detail })
  const refused = async (name: string, f: () => Promise<unknown>) => {
    try {
      const v = await f()
      check(name, false, `accepted: ${JSON.stringify(v)?.slice(0, 120)}`)
    } catch (e: any) {
      check(name, e?.code === 'Q002' || e?.name === 'StartError', String(e?.message ?? e))
    }
  }
  const s = await make()
  const ask = (p: Record<string, unknown>) => listParams({ mode: s.limits?.page === false ? 'cursor' : 'page', ...p }) // or a refusal proves nothing
  const sortable = (f: string) => !s.limits?.sort || s.limits.sort.includes(f)
  const ids = (r: { items: any[] }) => r.items.map(i => i.id)
  const count = (f: (r: ListRow) => boolean) => LIST_ROWS.filter(f).length
  const walk = async (sort: { field: string; dir: string } | null, filter = {}) => {
    const seen: any[] = []
    let after: unknown = null
    for (let i = 0; i < 40; i++) {
      const r = await s.list(ask({ mode: 'cursor', limit: 7, after, sort, filter }))
      seen.push(...r.items)
      if (r.next === undefined) break
      after = decode(String(r.next))
    }
    return seen
  }

  if (s.limits?.page !== false) {
    const first = await s.list(ask({ limit: 10 }))
    check('page: a page, its total and a next', first.items.length === 10 && first.total === 25 && first.next === 2 && first.prev === undefined, JSON.stringify({ n: first.items.length, t: first.total, next: first.next }))
    const last = await s.list(ask({ limit: 10, offset: 20 }))
    check('page: the last page has no next', last.items.length === 5 && last.next === undefined && last.prev === 2, JSON.stringify({ n: last.items.length, next: last.next, prev: last.prev }))
    const a = await s.list(ask({ limit: 25, sort: { field: 'title', dir: 'asc' } })), d = await s.list(ask({ limit: 25, sort: { field: 'title', dir: 'desc' } }))
    if (sortable('title')) check('page: desc is asc reversed', ids(a).join() === ids(d).reverse().join(), ids(a).slice(0, 3).join())
  }
  if (sortable('rank')) {
    for (const dir of ['asc', 'desc']) {
      const seen = await walk({ field: 'rank', dir })
      check(`cursor: ${dir} over ties sees every row once`, new Set(seen.map(r => r.id)).size === 25 && seen.length === 25, `${seen.length} rows, ${new Set(seen.map(r => r.id)).size} distinct`)
      check(`cursor: ${dir} stays sorted`, seen.every((r, i) => !i || (dir === 'asc' ? seen[i - 1].rank <= r.rank : seen[i - 1].rank >= r.rank)), seen.slice(0, 6).map(r => r.rank).join())
    }
  }
  const unsorted = await walk(null)
  check('cursor: no sort still walks every row by id', unsorted.length === 25 && new Set(unsorted.map(r => r.id)).size === 25, `${unsorted.length} rows`)

  const open = await walk(null, { status: 'open' })
  check('filter: equals', open.length === count(r => r.status === 'open') && open.every(r => r.status === 'open'), `${open.length}`)
  const two = await walk(null, { status: ['open', 'held'] })
  check('filter: a list means any of them', two.length === count(r => r.status !== 'done'), `${two.length}`)
  const none = await walk(null, { status: "x' OR '1'='1" })
  check('filter: a value is only ever a value', none.length === 0, `${none.length}`)
  check('filter: a filtered cursor keeps its filter across pages', (await walk(null, { status: 'open' })).every(r => r.status === 'open'))

  if (s.limits?.search !== false) {
    const prefix = !!s.limits?.search
    const hit = await s.list(ask({ limit: 25, search: prefix ? 'Alpha' : 'alpha' }))
    check('search: finds, whatever the case', hit.items.length === count(r => /alpha/i.test(r.title)), `${hit.items.length}`)
    if (!prefix) {
      const percent = await s.list(ask({ limit: 25, search: '100%_d' }))
      check('search: `%` and `_` are literal', percent.items.length === 1 && percent.items[0].id === 't07', `${percent.items.length}`)
      check('search: a regex is text', (await s.list(ask({ limit: 25, search: '.*' }))).items.length === 0)
    }
  }

  await refused('an unknown sort is refused', () => s.list(ask({ sort: { field: 'secret', dir: 'asc' } })))
  await refused('an unknown filter is refused', () => s.list(ask({ filter: { secret: 'x' } })))
  await refused('an object as a filter value is refused', () => s.list(ask({ filter: { status: { $ne: null } } })))
  await refused('a write to a column outside `columns` is refused', () => s.create({ id: 'x1', title: 'x', status: 'open', rank: 0, secret: 'y' }))
  await refused('moving an id is refused', () => s.update('t00', { id: 't99' }))

  const row = await s.get('t03')
  check('get: a row, in public names, without what `columns` leaves out', row?.id === 't03' && row.title === LIST_ROWS[3].title && !('secret' in row), JSON.stringify(row))
  check('get: nothing is null', (await s.get('nope')) === null)
  const made = await s.create({ id: 'n1', title: 'New', status: 'open', rank: 9 })
  check('create: returns the row', made?.id === 'n1' && made.rank === 9 && (await s.get('n1'))?.title === 'New', JSON.stringify(made))
  const moved = await s.update('n1', { title: 'Newer' })
  check('update: returns the row, and leaves the rest', moved?.title === 'Newer' && moved.rank === 9, JSON.stringify(moved))
  check('update: nothing is null', (await s.update('nope', { title: 'x' })) === null)
  check('remove: true, then gone, then false', (await s.remove('n1')) === true && (await s.get('n1')) === null && (await s.remove('n1')) === false)
  return out
}
