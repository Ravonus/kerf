import type { MeasureProvider } from '../surface'
import type { Check, MeasureSuiteOptions } from '../test-plugins'

/** Run `fn` with layout-forcing DOM reads throwing. */
function pure<T>(fn: () => T): T {
  const undo: (() => void)[] = []
  const forbid = (name: string) => () => {
    throw new Error(`layout-forcing read: ${name}`)
  }
  for (const [proto, key] of [
    [HTMLElement.prototype, 'offsetHeight'],
    [HTMLElement.prototype, 'offsetWidth'],
    [Element.prototype, 'clientHeight'],
    [Element.prototype, 'scrollHeight'],
  ] as [object, string][]) {
    const d = Object.getOwnPropertyDescriptor(proto, key)!
    Object.defineProperty(proto, key, { ...d, get: forbid(key) })
    undo.push(() => Object.defineProperty(proto, key, d))
  }
  for (const [host, key] of [
    [Element.prototype, 'getBoundingClientRect'],
    [Element.prototype, 'getClientRects'],
    [window, 'getComputedStyle'],
  ] as unknown as [Record<string, unknown>, string][]) {
    const f = host[key]
    host[key] = forbid(key)
    undo.push(() => {
      host[key] = f
    })
  }
  try {
    return fn()
  } finally {
    for (const u of undo) u()
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!

type Ctx = {
  p: MeasureProvider
  o: MeasureSuiteOptions
  widths: number[]
  lineHeight: number
  font: string
  out: Check[]
  dom: (texts: string[], width: number, face?: string) => number[]
  prepared: (
    texts: string[],
    face?: string,
    opts?: { segments?: boolean },
  ) => Promise<ReturnType<MeasureProvider['prepare']>[]>
}

async function textAccuracy({ p, o, widths, lineHeight, out, dom, prepared }: Ctx) {
  for (const corpus of o.corpora) {
    const hs = await prepared(corpus.texts)
    let wrong = 0,
      total = 0,
      example = ''
    for (const w of widths) {
      const real = dom(corpus.texts, w)
      for (let i = 0; i < hs.length; i++) {
        total++
        const got = p.layout(hs[i]!, w, lineHeight).height
        if (Math.abs(got - real[i]!) > 0.5) {
          wrong++
          example ||= `#${i} at ${w}px: ${got} vs DOM ${real[i]}`
        }
      }
    }
    const allow = corpus.allow ?? 0
    out.push({
      name: `accuracy: ${corpus.name}`,
      ok: wrong / total <= allow,
      detail: `${wrong}/${total} heights differ from the DOM (allowed ${(allow * 100).toFixed(1)}%)${example ? `; ${example}` : ''}`,
    })
  }
}

async function textChecks({ p, o, widths, lineHeight, font, out, prepared }: Ctx) {
  const first = o.corpora[0]!.texts
  const lined = await prepared(first, font, { segments: true })
  let broken = ''
  for (let i = 0; i < lined.length && !broken; i++) {
    const w = widths[0]!
    const lines = p.lines(lined[i]!, w)
    const count = p.layout(lined[i]!, w, lineHeight).lineCount
    const text = lines
      .map((l) => p.lineText(lined[i]!, l))
      .join(' ')
      .replace(/\s+/g, '')
    if (lines.length !== count) broken = `#${i}: ${lines.length} lines, layout says ${count}`
    else if (text !== first[i]!.replace(/\s+/g, ''))
      broken = `#${i}: the lines' text isn't the paragraph's`
  }
  out.push({
    name: 'lines: agree with layout, and lineText returns the text',
    ok: !broken,
    detail: broken || `${lined.length} paragraphs`,
  })

  const hs = await prepared(first)
  let impure = ''
  try {
    pure(() => {
      for (const h of hs) p.layout(h, widths[0]!, lineHeight)
    })
  } catch (e) {
    impure = (e as Error).message
  }
  out.push({
    name: 'purity: layout reads no DOM',
    ok: !impure,
    detail: impure || 'no layout-forcing read',
  })

  const per1k = (n: number, ms: number) => (ms * 1000) / n
  const layoutMs: number[] = [],
    prepareMs: number[] = []
  for (let r = 0; r < 9; r++) {
    const t0 = performance.now()
    for (const h of hs) p.layout(h, widths[1] ?? widths[0]!, lineHeight)
    layoutMs.push(per1k(hs.length, performance.now() - t0))
    const t1 = performance.now()
    for (const t of first) p.prepare(t, font)
    prepareMs.push(per1k(first.length, performance.now() - t1))
  }
  const layoutBudget = o.budgets?.layout ?? 0.5,
    prepareBudget = o.budgets?.prepare ?? 15
  out.push({
    name: 'speed: layout',
    ok: median(layoutMs) <= layoutBudget,
    detail: `${median(layoutMs).toFixed(3)} ms per 1k (≤ ${layoutBudget})`,
  })
  out.push({
    name: 'speed: prepare',
    ok: median(prepareMs) <= prepareBudget,
    detail: `${median(prepareMs).toFixed(2)} ms per 1k, widths cached (≤ ${prepareBudget})`,
  })
  return first
}

/** One Check per requirement of `text.measure@1`. Any `ok: false` is P119. */
export async function textMeasureSuite(
  p: MeasureProvider,
  o: MeasureSuiteOptions,
): Promise<Check[]> {
  const family = o.family ?? 'Arial',
    size = o.size ?? 16,
    lineHeight = o.lineHeight ?? 24,
    widths = o.widths ?? [320, 480]
  const font = `${size}px ${family}`
  const out: Check[] = []

  const box = document.body.appendChild(document.createElement('div'))
  box.style.cssText = `position:absolute;visibility:hidden;font:${font};line-height:${lineHeight}px;white-space:normal;overflow-wrap:break-word`
  const dom = (texts: string[], width: number, face = font) => {
    box.style.width = `${width}px`
    box.style.font = face
    box.style.lineHeight = `${lineHeight}px`
    box.replaceChildren(
      ...texts.map((t) => Object.assign(document.createElement('div'), { textContent: t })),
    )
    return [...box.children].map((c) => c.getBoundingClientRect().height)
  }
  const prepared = async (texts: string[], face = font, opts?: { segments?: boolean }) => {
    const hs = texts.map((t) => p.prepare(t, face, opts))
    for (const h of hs) await h.ready
    return hs
  }

  const ctx = { p, o, widths, lineHeight, font, out, dom, prepared }
  await textAccuracy(ctx)

  const first = await textChecks(ctx)

  if (o.webFont) {
    const face = `${size}px "${o.webFont.family}"`
    const stale = await prepared(first, face)
    const before = stale.map((h) => p.layout(h, widths[0]!, lineHeight).height)
    const f = new FontFace(o.webFont.family, `url(${o.webFont.url})`)
    document.fonts.add(await f.load())
    p.clear()
    const fresh = await prepared(first, face)
    const real = dom(first, widths[0]!, face)
    let wrong = 0
    fresh.forEach((h, i) => {
      if (Math.abs(p.layout(h, widths[0]!, lineHeight).height - real[i]!) > 0.5) wrong++
    })
    const moved = before.filter((h, i) => h !== real[i]).length
    out.push({
      name: 'fonts: after clear(), results match the real face',
      ok: wrong === 0 && moved > 0,
      detail: `${wrong}/${fresh.length} differ from the DOM; the font changed ${moved} heights, so this run could fail`,
    })
  }
  box.remove()
  return out
}

// ---- realtime.bus@1 and db.adapter@1: plain Node, against a real server where the provider has one ----
