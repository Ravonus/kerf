// The agent pack's pure logic: the fold first, since every part renders only what it returns.
import { argsDiff, applySuggest, contextLevel, foldAnswer, parseInline, parseText, suggestQuery, toolStatus, traceKey, traceRows, traceSummary, stick, formatTokens, formatClock, dictation, speechWave, type AgentEvent, type AgentTool, type Answer } from '../src'

const tools = (a: Answer) => a.tools.map(t => t.state)

describe('foldAnswer', () => {
  test('nothing yet is waiting', () => expect(foldAnswer([]).state).toBe('waiting'))

  test('text coalesces, and reasoning folds with its duration when the answer starts', () => {
    const a = foldAnswer([{ kind: 'reasoning', text: 'a', at: 1000 }, { kind: 'reasoning', text: 'b' }, { kind: 'text', text: 'x', at: 5000 }, { kind: 'text', text: 'y' }])
    expect(a.state).toBe('streaming')
    expect(a.blocks).toHaveLength(2)
    expect(a.blocks[0]).toMatchObject({ kind: 'reasoning', text: 'ab', streaming: false, seconds: 4 })
    expect(a.blocks[1]).toMatchObject({ kind: 'text', text: 'xy' })
  })

  test('a tool runs, waits and settles, and keeps its place among the text', () => {
    const e: AgentEvent[] = [{ kind: 'text', text: 'a' }, { kind: 'approval', id: 't', name: 'edit', args: '{}' }]
    const asked = foldAnswer(e)
    expect(asked.state).toBe('approval')
    expect(tools(asked)).toEqual(['approval'])
    const ran = foldAnswer([...e, { kind: 'tool', id: 't', args: '{"x":1}', at: 100 }])
    expect(ran.state).toBe('streaming')
    expect(ran.tools[0]).toMatchObject({ state: 'running', args: '{"x":1}', name: 'edit' })
    const done = foldAnswer([...e, { kind: 'tool', id: 't', at: 100 }, { kind: 'tool-result', id: 't', output: 'ok', at: 700 }, { kind: 'text', text: 'b' }])
    expect(done.tools[0]).toMatchObject({ state: 'done', output: 'ok', ms: 600 })
    expect(done.blocks.map(b => b.kind)).toEqual(['text', 'tool', 'text'])
  })

  test('failed and denied results', () => {
    expect(tools(foldAnswer([{ kind: 'tool', id: 't' }, { kind: 'tool-result', id: 't', exit: 2 }]))).toEqual(['failed'])
    expect(tools(foldAnswer([{ kind: 'tool', id: 't' }, { kind: 'tool-result', id: 't', failed: true }]))).toEqual(['failed'])
    expect(tools(foldAnswer([{ kind: 'approval', id: 't' }, { kind: 'tool-result', id: 't', denied: true }]))).toEqual(['denied'])
  })

  test('a question pauses until answered', () => {
    const q: AgentEvent = { kind: 'question', id: 'q', prompt: 'P', options: ['a'] }
    expect(foldAnswer([q]).state).toBe('approval')
    const a = foldAnswer([q, { kind: 'question', id: 'q', answer: 'a' }])
    expect(a.state).toBe('streaming')
    expect(a.blocks).toHaveLength(1)
    expect(a.blocks[0]).toMatchObject({ question: { answer: 'a', prompt: 'P' } })
  })

  test('sources keep their order and repeat ids once; the plan replaces and steps patch', () => {
    const a = foldAnswer([{ kind: 'source', id: 'a', title: 'A' }, { kind: 'source', id: 'b', title: 'B' }, { kind: 'source', id: 'a', title: 'A' }, { kind: 'plan', steps: [{ id: 's', title: 'S', state: 'pending' }] }, { kind: 'plan', id: 's', state: 'blocked', note: 'Why' }])
    expect(a.sources.map(s => s.title)).toEqual(['A', 'B'])
    expect(a.plan[0]).toMatchObject({ state: 'blocked', note: 'Why' })
  })

  test('done finishes what ran; Stop keeps what arrived and settles the rest', () => {
    const e: AgentEvent[] = [{ kind: 'plan', steps: [{ id: 'a', title: 'A', state: 'done' }, { id: 'b', title: 'B', state: 'running' }] }, { kind: 'reasoning', text: 'r' }, { kind: 'text', text: 'kept' }, { kind: 'tool', id: 't' }, { kind: 'approval', id: 'u' }, { kind: 'question', id: 'q', prompt: 'P' }]
    const stopped = foldAnswer([...e, { kind: 'done', stopped: true }])
    expect(stopped.state).toBe('stopped')
    expect(tools(stopped)).toEqual(['failed', 'denied'])
    expect(stopped.plan.map(s => s.state)).toEqual(['done', 'pending'])
    expect(stopped.blocks.find(b => b.kind === 'text')).toMatchObject({ text: 'kept' })
    expect(stopped.blocks.find(b => b.kind === 'question')).toMatchObject({ question: { closed: true } })
    const done = foldAnswer([...e.slice(0, 3), { kind: 'done' }])
    expect(done.state).toBe('done')
    expect(done.plan.map(s => s.state)).toEqual(['done', 'done'])
    expect(done.blocks[0]).toMatchObject({ streaming: false })
  })

  test('an error stays, whatever follows', () => {
    const a = foldAnswer([{ kind: 'text', text: 'x' }, { kind: 'tool', id: 't' }, { kind: 'error', message: 'Dropped' }, { kind: 'text', text: 'y' }])
    expect(a).toMatchObject({ state: 'error', error: 'Dropped' })
    expect(tools(a)).toEqual(['failed'])
  })

  test('as a reducer it matches the list form, and never mutates what it was given', () => {
    const e: AgentEvent[] = [{ kind: 'text', text: 'a' }, { kind: 'tool', id: 't', name: 'n' }, { kind: 'tool-result', id: 't', output: 'o' }, { kind: 'done' }]
    let a: Answer | undefined
    const seen: string[] = []
    for (const x of e) { a = foldAnswer(a, x); seen.push(JSON.stringify(a)) }
    expect(a).toEqual(foldAnswer(e))
    const copy = JSON.stringify(foldAnswer(e.slice(0, 2)))
    const before = foldAnswer(e.slice(0, 2))
    foldAnswer(before, e[2])
    expect(JSON.stringify(before)).toBe(copy)
    expect(seen[0]).not.toBe(seen[3])
  })
})

test('parseText: paragraphs, lists, closed and open fences', () => {
  const b = parseText('one\ntwo\n\n- a\n- b\n\n```ts\ncode\n```\nafter\n\n```\nopen')
  expect(b.map(x => x.kind)).toEqual(['p', 'ul', 'code', 'p', 'code'])
  expect(b[0]).toMatchObject({ text: 'one\ntwo' })
  expect(b[1]).toMatchObject({ items: [{ text: 'a' }, { text: 'b' }] })
  expect(b[2]).toMatchObject({ lang: 'ts', text: 'code', open: false })
  expect(b[4]).toMatchObject({ lang: '', text: 'open', open: true })
})

test('parseText keys a growing block by where it starts', () => {
  expect(parseText('a')[0].at).toBe(parseText('a b c')[0].at)
  expect(parseText('')).toEqual([])
})

test('parseInline: code and cites, nothing else', () => {
  expect(parseInline('a `b` [2] <i>')).toEqual([{ kind: 'text', at: 0, text: 'a ' }, { kind: 'code', at: 2, text: 'b' }, { kind: 'text', at: 5, text: ' ' }, { kind: 'cite', at: 6, n: 2 }, { kind: 'text', at: 9, text: ' <i>' }])
  expect(parseInline('half `open')).toEqual([{ kind: 'text', at: 0, text: 'half `open' }])
})

test('toolStatus says the state in words', () => {
  const t = (x: Partial<AgentTool>): AgentTool => ({ id: 'i', name: 'run', args: '', state: 'done', ...x })
  const read = (x: Partial<AgentTool>) => { const m = toolStatus(t(x)); return `run${m.word}${m.status}` }
  expect(read({ ms: 640 })).toBe('run, done, 0.6 s')
  expect(read({})).toBe('run, done')
  expect(read({ state: 'failed' })).toBe('run, failed')
  expect(read({ state: 'failed', exit: 1 })).toBe('run, failed, exit 1')
  expect(read({ state: 'approval' })).toBe('run, needs approval')
})

test('contextLevel at 80 and 95', () => {
  expect([0.79, 0.8, 0.94, 0.95].map(contextLevel)).toEqual([undefined, 'high', 'high', 'full'])
})

test('formats', () => {
  expect([999, 46000, 1500000].map(formatTokens)).toEqual(['999', '46k', '1.5M'])
  expect(formatClock(65)).toBe('1:05')
})

test('argsDiff shows only changed lines', () => {
  expect(argsDiff('a\nb', 'a\nb')).toEqual([])
  expect(argsDiff('a\nb\nc', 'a\nx\nc\nd')).toEqual(['- b', '+ x', '+ d'])
})

test('suggestQuery: / only at the start, @ at a word start', () => {
  expect(suggestQuery('/pl', 3)).toEqual({ trigger: '/', query: 'pl', start: 0 })
  expect(suggestQuery('a /pl', 5)).toBeNull()
  expect(suggestQuery('hi @Ko', 6)).toEqual({ trigger: '@', query: 'ko', start: 3 })
  expect(suggestQuery('a@b', 3)).toBeNull()
  expect(suggestQuery('hi @k there', 11)).toBeNull()
  expect(applySuggest('hi @k x', 3, 5, '@kofi')).toEqual({ text: 'hi @kofi  x', caret: 9 })
})

const SPANS = [{ id: 'r', name: 'r', start: 100, ms: 1000, tokens: 1500, cost: 0.0123, children: [{ id: 'a', name: 'a', start: 100, ms: 250, children: [{ id: 'x', name: 'x', start: 100, ms: 100 }] }, { id: 'b', name: 'b', start: 600, ms: 500 }] }]

test('traceRows flattens onto one axis and hides what is collapsed', () => {
  const rows = traceRows(SPANS)
  expect(rows.map(r => [r.id, r.level, r.pos, r.size])).toEqual([['r', 1, 1, 1], ['a', 2, 1, 2], ['x', 3, 1, 1], ['b', 2, 2, 2]])
  expect(rows[3]).toMatchObject({ x: 0.5, w: 0.5, parent: 'r', branch: false })
  expect(new Set(rows.map(r => r.color)).size).toBe(4)
  const shut = traceRows(SPANS, new Set(['a']))
  expect(shut.map(r => r.id)).toEqual(['r', 'a', 'b'])
  expect(shut[1].open).toBe(false)
  expect(shut[2].color).toBe(rows[3].color)
  expect(traceRows([])).toEqual([])
})

test('traceSummary leaves out what a span lacks', () => {
  expect(traceSummary({ ms: 1000, tokens: 1500, cost: 0.0123 })).toBe('1.0 s · 2k tok · $0.012')
  expect(traceSummary({ ms: 1000 })).toBe('1.0 s')
})

test('traceKey follows the APG tree', () => {
  const rows = traceRows(SPANS)
  expect(traceKey('ArrowDown', rows, 0)).toEqual({ focus: 'a' })
  expect(traceKey('End', rows, 0)).toEqual({ focus: 'b' })
  expect(traceKey('ArrowRight', rows, 0)).toEqual({ focus: 'a' })
  expect(traceKey('ArrowLeft', rows, 0)).toEqual({ toggle: 'r' })
  expect(traceKey('ArrowLeft', rows, 2)).toEqual({ focus: 'a' })
  expect(traceKey('ArrowRight', rows, 2)).toEqual({})
  expect(traceKey('Enter', rows, 1)).toEqual({ toggle: 'a' })
  expect(traceKey('ArrowRight', rows, 1, true)).toEqual({ toggle: 'a' })
  expect(traceKey('a', rows, 1)).toBeNull()
  const shut = traceRows(SPANS, new Set(['r']))
  expect(traceKey('ArrowRight', shut, 0)).toEqual({ toggle: 'r' })
})

describe('stick', () => {
  const box = (scrollHeight: number, clientHeight: number) => {
    const el = document.body.appendChild(document.createElement('div'))
    Object.defineProperties(el, { scrollHeight: { value: scrollHeight, configurable: true, writable: true }, clientHeight: { value: clientHeight, configurable: true } })
    return el
  }
  const tick = () => new Promise(r => setTimeout(r))

  test('goes to the bottom and follows growth while within 48px', async () => {
    const el = box(1000, 100)
    const away: boolean[] = []
    const a = stick(el, { onAway: v => away.push(v) })
    expect(el.scrollTop).toBe(1000)
    el.scrollTop = 860
    el.dispatchEvent(new Event('scroll'))
    expect(away.at(-1)).toBe(false)
    ;(el as any).scrollHeight = 2000
    el.append('more')
    await tick()
    expect(el.scrollTop).toBe(2000)
    a.destroy()
  })

  test('leaves someone who scrolled up alone, and reports it', async () => {
    const el = box(1000, 100)
    const away: boolean[] = []
    const a = stick(el, { onAway: v => away.push(v) })
    el.scrollTop = 500
    el.dispatchEvent(new Event('scroll'))
    expect(away.at(-1)).toBe(true)
    ;(el as any).scrollHeight = 2000
    el.append('more')
    await tick()
    expect(el.scrollTop).toBe(500)
    a.destroy()
    el.scrollTop = 0
    el.dispatchEvent(new Event('scroll'))
    expect(away).toHaveLength(2)
  })
})

test('speechWave carries the newest level along', () => {
  const el = document.createElement('div')
  el.innerHTML = '<i></i><i></i><i></i>'
  const w = speechWave(el)
  w.update(0.5); w.update(0.25)
  expect([...el.children].map(i => (i as HTMLElement).style.getPropertyValue('--a'))).toEqual(['0.25', '0.50', '0.00'])
})

describe('dictation', () => {
  const events = () => { const log: any[] = []; return { log, on: { onState: (s: string) => log.push(s), onTranscript: (f: string, i: string) => log.push([f, i]), onLevel: () => {} } } }
  const page = (Speech?: any, getUserMedia: any = async () => undefined) => ({ SpeechRecognition: Speech, navigator: { mediaDevices: { getUserMedia } }, cancelAnimationFrame() {}, requestAnimationFrame() { return 0 } }) as any
  class Speech { static last: Speech; start() {} stop() { (this as any).onend() } abort() {} constructor() { Speech.last = this } }

  test('no recognition in the browser is a state', () => {
    const { log, on } = events()
    dictation(page(), on).start()
    expect(log).toEqual(['unsupported'])
  })

  test('final and interim words, then idle at the end', () => {
    const { log, on } = events()
    const d = dictation(page(Speech), on)
    d.start()
    ;(Speech.last as any).onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'Hello ' }], { isFinal: true }), Object.assign([{ transcript: 'wor' }], { isFinal: false })] })
    d.stop()
    expect(log).toEqual(['listening', ['Hello ', 'wor'], 'idle'])
  })

  test('a refused mic is blocked', async () => {
    const { log, on } = events()
    const a = dictation(page(Speech), on)
    a.start()
    ;(Speech.last as any).onerror({ error: 'not-allowed' })
    expect(log).toEqual(['listening', 'blocked'])
    const two = events()
    dictation(page(Speech, async () => { throw new Error('denied') }), two.on).start()
    await new Promise(r => setTimeout(r))
    expect(two.log).toEqual(['listening', 'blocked'])
  })
})
