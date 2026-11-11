// @kerf-js/core/test/plugins: conformance suites that ship with a slot, so any provider can be held to them (research 13 §2.11).
// `textMeasureSuite` runs in a page, against real layout: a test double can't show a line count is right. A runner loads
// it in each pinned browser (packages/text/test/conformance.mjs).

export { textMeasureSuite } from './test-plugins/measure'

/** One result of a suite: its name, whether it held, and what it saw. */
export interface Check {
  name: string
  ok: boolean
  detail: string
}

/** Texts a measure suite lays out and compares with the DOM. */
export interface Corpus {
  name: string
  texts: string[]
  /** Share of height mismatches allowed: 0 for Latin, emoji and Arabic, 0.005 for CJK (research 11 §8.4). */
  allow?: number
}

/** What `measureSuite` measures, at which widths, and within what budgets. */
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

// ---- realtime.bus@1 and db.adapter@1: plain Node, against a real server where the provider has one ----

const pause = (ms: number) =>
  new Promise((ok) => {
    setTimeout(ok, ms)
  })
const settle = async (done: () => boolean, ms = 5000) => {
  for (const end = Date.now() + ms; !done() && Date.now() < end;) await pause(5)
  return done()
}

/** The bus under test: what a bus provider has to do. */
export interface BusLike {
  readonly name: string
  publish(channel: string, message: string): Promise<void>
  subscribe(channel: string, on: (message: string) => void, gap?: () => void): Promise<() => void>
  close?(): Promise<void>
}

/** How `busSuite` makes the buses it tests. */
export interface BusSuiteOptions {
  /** Two calls are two instances of the app. */
  make: () => BusLike | Promise<BusLike>
  /** Drop the provider's connections: a server restart. Without it the gap check isn't run. */
  restart?: () => Promise<void>
}

async function busCross(
  a: BusLike,
  b: BusLike,
  room: (s: string) => string,
  check: (name: string, ok: boolean, detail?: string) => void,
) {
  {
    const got: string[] = []
    let gaps = 0
    const c = room('cross')
    const off = await a.subscribe(
      c,
      (m) => got.push(m),
      () => gaps++,
    )
    await b.publish(c, 'one') // straight after `subscribe` resolves: it means listening
    check(
      'a publish after `subscribe` resolves arrives on the other instance',
      await settle(() => got.length === 1),
      `${got.length} messages`,
    )
    check('a first connect is not a gap', gaps === 0, `${gaps} gaps`)
    await pause(100)
    check('a message arrives once', got.length === 1, `${got.length} deliveries`)
    for (let i = 0; i < 200; i++) await b.publish(c, `m${i}`)
    await settle(() => got.length === 201)
    check(
      'messages from one publisher stay in order',
      got.slice(1).every((m, i) => m === `m${i}`) && got.length === 201,
      `${got.length} of 201`,
    )
    off()
    await b.publish(c, 'late')
    await pause(100)
    check('nothing arrives after the stop', got.at(-1) !== 'late', got.at(-1) ?? '')
  }
}

/** One Check per requirement of `realtime.bus@1`. Any `ok: false` is P119. */
export async function busSuite({ make, restart }: BusSuiteOptions): Promise<Check[]> {
  const out: Check[] = []
  const check = (name: string, ok: boolean, detail = '') => void out.push({ name, ok, detail })
  const a = await make(),
    b = await make()
  const room = (s: string) => `kerf:c:conform-${Date.now()}-${s}:{"room":"a*b> c é"}`
  try {
    await busCross(a, b, room, check)

    {
      const got: string[] = [],
        c = room('apart'),
        big = `é${'x'.repeat(200_000)}"\n`
      await a.subscribe(c, (m) => got.push(m))
      await b.publish(room('other'), 'not here')
      await b.publish(c, big)
      await settle(() => got.length > 0)
      check(
        'channels are separate, and a large message survives byte for byte',
        got.length === 1 && got[0] === big,
        `${got.length} messages`,
      )
    }
    {
      const c = room('both'),
        first: string[] = [],
        second: string[] = []
      const off = await a.subscribe(c, (m) => first.push(m))
      await a.subscribe(c, (m) => second.push(m))
      off()
      await b.publish(c, 'x')
      check(
        'stopping one listener leaves the other on the channel',
        (await settle(() => second.length === 1)) && !first.length,
        `${second.length} / ${first.length}`,
      )
    }
    if (restart) {
      const c = room('gap'),
        got: string[] = []
      let gaps = 0
      await a.subscribe(
        c,
        (m) => got.push(m),
        () => gaps++,
      )
      await restart()
      check('a dropped connection is a gap', await settle(() => gaps > 0, 15_000), `${gaps} gaps`)
      const ok = await settle(() => {
        void b.publish(c, 'after').catch(() => {})
        return got.length > 0
      }, 15_000)
      check('delivery resumes after a gap', ok, `${got.length} messages`)
    }
  } finally {
    await a.close?.().catch(() => {})
    await b.close?.().catch(() => {})
  }
  return out
}

/** The list source under test: what a data source has to do. */
export interface SourceLike<R = unknown> {
  list(
    params: unknown,
  ): Promise<{ items: R[]; total?: number; next?: string | number; prev?: string | number }>
  get(id: unknown): Promise<R | null | undefined>
  create(data: Record<string, unknown>): Promise<R>
  update(id: unknown, patch: Record<string, unknown>): Promise<R>
  remove(id: unknown): Promise<boolean>
  readonly limits?: { page?: false; search?: 'prefix' | 'cased' | false; sort?: readonly string[] }
}

/** A row of `LIST_ROWS`, in its public names. */
export interface ListRow {
  id: string
  title: string
  status: string
  rank: number
}

/** The rows a source under test starts with. `secret` exists in storage and is left out of its `columns`. */
export const LIST_ROWS: (ListRow & { secret: string })[] = Array.from({ length: 25 }, (_, i) => ({
  id: `t${String(i).padStart(2, '0')}`,
  title: `${i % 5 === 0 ? 'Alpha' : 'beta'} ${i}${i === 7 ? ' 100%_done' : ''}`,
  status: ['open', 'done', 'held'][i % 3]!,
  rank: i % 4, // ties on purpose: a cursor has to hold across them
  secret: 'never returned',
}))

/** How `listSuite` makes the source it tests. */
export interface ListSuiteOptions {
  /** A source over `LIST_ROWS`, written fresh. `columns` are `id`, `title`, `status`, `rank`; search covers `title`. */
  make: () => SourceLike | Promise<SourceLike>
  decode: (cursor: string) => [unknown, unknown] | null
}

const listParams = (p: Record<string, unknown>) => ({
  mode: 'page',
  limit: 10,
  offset: 0,
  after: null,
  sort: null,
  filter: {},
  ...p,
})

type ListCtx = {
  s: SourceLike<ListRow>
  ask: (p: Record<string, unknown>) => Record<string, unknown>
  check: (name: string, ok: boolean, detail?: string) => void
  sortable: (f: string) => boolean
  ids: (r: { items: ListRow[] }) => string[]
  walk: (sort: { field: string; dir: string } | null, filter?: object) => Promise<ListRow[]>
  count: (f: (r: ListRow) => boolean) => number
}

async function listPages({ s, ask, check, sortable, ids, walk }: ListCtx) {
  if (s.limits?.page !== false) {
    const first = await s.list(ask({ limit: 10 }))
    check(
      'page: a page, its total and a next',
      first.items.length === 10 &&
        first.total === 25 &&
        first.next === 2 &&
        first.prev === undefined,
      JSON.stringify({ n: first.items.length, t: first.total, next: first.next }),
    )
    const last = await s.list(ask({ limit: 10, offset: 20 }))
    check(
      'page: the last page has no next',
      last.items.length === 5 && last.next === undefined && last.prev === 2,
      JSON.stringify({ n: last.items.length, next: last.next, prev: last.prev }),
    )
    const a = await s.list(ask({ limit: 25, sort: { field: 'title', dir: 'asc' } })),
      d = await s.list(ask({ limit: 25, sort: { field: 'title', dir: 'desc' } }))
    if (sortable('title'))
      check(
        'page: desc is asc reversed',
        ids(a).join() === ids(d).reverse().join(),
        ids(a).slice(0, 3).join(),
      )
  }
  if (sortable('rank')) {
    for (const dir of ['asc', 'desc']) {
      const seen = await walk({ field: 'rank', dir })
      check(
        `cursor: ${dir} over ties sees every row once`,
        new Set(seen.map((r) => r.id)).size === 25 && seen.length === 25,
        `${seen.length} rows, ${new Set(seen.map((r) => r.id)).size} distinct`,
      )
      check(
        `cursor: ${dir} stays sorted`,
        seen.every(
          (r, i) =>
            !i || (dir === 'asc' ? seen[i - 1]!.rank <= r.rank : seen[i - 1]!.rank >= r.rank),
        ),
        seen
          .slice(0, 6)
          .map((r) => r.rank)
          .join(),
      )
    }
  }
}

async function listFilters({ s, ask, check, walk, count }: ListCtx) {
  const unsorted = await walk(null)
  check(
    'cursor: no sort still walks every row by id',
    unsorted.length === 25 && new Set(unsorted.map((r) => r.id)).size === 25,
    `${unsorted.length} rows`,
  )

  const open = await walk(null, { status: 'open' })
  check(
    'filter: equals',
    open.length === count((r) => r.status === 'open') && open.every((r) => r.status === 'open'),
    `${open.length}`,
  )
  const two = await walk(null, { status: ['open', 'held'] })
  check(
    'filter: a list means any of them',
    two.length === count((r) => r.status !== 'done'),
    `${two.length}`,
  )
  const none = await walk(null, { status: "x' OR '1'='1" })
  check('filter: a value is only ever a value', none.length === 0, `${none.length}`)
  check(
    'filter: a filtered cursor keeps its filter across pages',
    (await walk(null, { status: 'open' })).every((r) => r.status === 'open'),
  )

  if (s.limits?.search !== false) {
    const prefix = !!s.limits?.search
    const hit = await s.list(ask({ limit: 25, search: prefix ? 'Alpha' : 'alpha' }))
    check(
      'search: finds, whatever the case',
      hit.items.length === count((r) => /alpha/i.test(r.title)),
      `${hit.items.length}`,
    )
    if (!prefix) {
      const percent = await s.list(ask({ limit: 25, search: '100%_d' }))
      check(
        'search: `%` and `_` are literal',
        percent.items.length === 1 && percent.items[0]!.id === 't07',
        `${percent.items.length}`,
      )
      check(
        'search: a regex is text',
        (await s.list(ask({ limit: 25, search: '.*' }))).items.length === 0,
      )
    }
  }
}

/** One Check per requirement of `db.adapter@1`. Runs over `limits`, so a source says what it can't do. Any `ok: false` is P119. */
export async function listSuite({ make, decode }: ListSuiteOptions): Promise<Check[]> {
  const out: Check[] = []
  const check = (name: string, ok: boolean, detail = '') => void out.push({ name, ok, detail })
  const refused = async (name: string, f: () => Promise<unknown>) => {
    try {
      const v = await f()
      check(name, false, `accepted: ${JSON.stringify(v)?.slice(0, 120)}`)
    } catch (e) {
      const err = e as { code?: string; name?: string; message?: string } | undefined
      check(name, err?.code === 'Q002' || err?.name === 'StartError', String(err?.message ?? e))
    }
  }
  const s = (await make()) as SourceLike<ListRow>
  const ask = (p: Record<string, unknown>) =>
    listParams({ mode: s.limits?.page === false ? 'cursor' : 'page', ...p }) // or a refusal proves nothing
  const sortable = (f: string) => !s.limits?.sort || s.limits.sort.includes(f)
  const ids = (r: { items: ListRow[] }) => r.items.map((i) => i.id)
  const count = (f: (r: ListRow) => boolean) => LIST_ROWS.filter(f).length
  const walk = async (sort: { field: string; dir: string } | null, filter = {}) => {
    const seen: ListRow[] = []
    let after: unknown = null
    for (let i = 0; i < 40; i++) {
      const r = await s.list(ask({ mode: 'cursor', limit: 7, after, sort, filter }))
      seen.push(...r.items)
      if (r.next === undefined) break
      after = decode(String(r.next))
    }
    return seen
  }

  const ctx = { s, ask, check, sortable, ids, walk, count }
  await listPages(ctx)

  await listFilters(ctx)

  await refused('an unknown sort is refused', () =>
    s.list(ask({ sort: { field: 'secret', dir: 'asc' } })),
  )
  await refused('an unknown filter is refused', () => s.list(ask({ filter: { secret: 'x' } })))
  await refused('an object as a filter value is refused', () =>
    s.list(ask({ filter: { status: { $ne: null } } })),
  )
  await refused('a write to a column outside `columns` is refused', () =>
    s.create({ id: 'x1', title: 'x', status: 'open', rank: 0, secret: 'y' }),
  )
  await refused('moving an id is refused', () => s.update('t00', { id: 't99' }))

  const row = await s.get('t03')
  check(
    'get: a row, in public names, without what `columns` leaves out',
    row?.id === 't03' && row.title === LIST_ROWS[3]!.title && !('secret' in row),
    JSON.stringify(row),
  )
  check('get: nothing is null', (await s.get('nope')) === null)
  const made = await s.create({ id: 'n1', title: 'New', status: 'open', rank: 9 })
  check(
    'create: returns the row',
    made?.id === 'n1' && made.rank === 9 && (await s.get('n1'))?.title === 'New',
    JSON.stringify(made),
  )
  const moved = await s.update('n1', { title: 'Newer' })
  check(
    'update: returns the row, and leaves the rest',
    moved?.title === 'Newer' && moved.rank === 9,
    JSON.stringify(moved),
  )
  check('update: nothing is null', (await s.update('nope', { title: 'x' })) === null)
  check(
    'remove: true, then gone, then false',
    (await s.remove('n1')) && (await s.get('n1')) === null && !(await s.remove('n1')),
  )
  return out
}
