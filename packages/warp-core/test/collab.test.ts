import { arrivalTracker, burst, cursorPoint, excerpt, findCard, insertMention, integrityCounter, joinNames, mentionQuery, moveCard, moveLine, p95, peerColor, presenceDelta, quoteText, reactionName, stepCard, syncedForm, textParts, threadRows, typingLine, type ChatMessage, type FormOp } from '../src/collab'

const ana = { id: 'ana', name: 'Ana Ruiz' }, kofi = { id: 'kofi', name: 'Kofi Mensah' }
const msg = (id: string, author: typeof ana, min: number, day: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, author, text: id, time: '', at: min * 60_000, day, ...extra })

test('peer colours are 1–8, stable, and an explicit one wins', () => {
  for (const id of ['a', 'ana', 'kofi-mensah', 'z'.repeat(40)]) {
    const c = peerColor({ id })
    expect(c).toBeGreaterThanOrEqual(1)
    expect(c).toBeLessThanOrEqual(8)
    expect(peerColor({ id })).toBe(c)
  }
  expect(peerColor({ id: 'a', color: 7 })).toBe(7)
})

test('names, typing and presence read as sentences', () => {
  expect(joinNames(['Ana', 'Kofi', 'Mei'])).toBe('Ana, Kofi and Mei')
  expect(typingLine([])).toBe('')
  expect(typingLine(['Mei'])).toBe('Mei is typing…')
  expect(typingLine(['Mei', 'Ana'])).toBe('Mei and Ana are typing…')
  expect(typingLine(['a', 'b', 'c'])).toBe('3 people are typing…')
  expect(presenceDelta([ana], [kofi])).toBe('Kofi joined. Ana left')
  expect(presenceDelta([ana], [ana])).toBe('')
})

test('burst hands over everything after a quiet second', () => {
  vi.useFakeTimers()
  const got: string[][] = []
  const b = burst<string>(x => got.push(x))
  b.push('a'); vi.advanceTimersByTime(900); b.push('b'); vi.advanceTimersByTime(999)
  expect(got).toEqual([])
  vi.advanceTimersByTime(1)
  expect(got).toEqual([['a', 'b']])
  vi.useRealTimers()
})

test('arrivals: the first list never counts, new ids once', () => {
  const mark = arrivalTracker()
  expect(mark(['a', 'b'])).toEqual([])
  expect(mark(['a', 'b', 'c'])).toEqual(['c'])
  expect(mark(['c', 'a', 'b'])).toEqual(['c'])
})

test('rows: day dividers, the unread divider folds into a day, grouping stops at 5 minutes, a day, or me', () => {
  const rows = threadRows([
    msg('a', ana, 0, 'Mon'), msg('b', ana, 4, 'Mon'), msg('c', ana, 10, 'Mon'),
    msg('d', ana, 11, 'Tue'), msg('e', ana, 12, 'Tue'), msg('f', kofi, 13, 'Tue', { mine: true }), msg('g', kofi, 14, 'Tue', { mine: true }),
  ], 'd')
  expect(rows.map(r => (r.kind === 'message' ? `${r.id}${r.continued ? '+' : ''}${r.last ? '!' : ''}` : r.label))).toEqual(['Mon', 'a', 'b+', 'c', 'New · Tue', 'd', 'e+', 'f', 'g!'])
  const mid = threadRows([msg('a', ana, 0, 'Mon'), msg('b', ana, 1, 'Mon')], 'b')
  expect(mid.map(r => r.kind)).toEqual(['day', 'message', 'unread', 'message'])
})

test('a quote is clamped to 280 with an ellipsis, a selection wins, an attachment quotes as its file name', () => {
  expect(excerpt('  a \n b ')).toBe('a b')
  const long = excerpt('x'.repeat(400))
  expect(long.length).toBe(280)
  expect(long.endsWith('…')).toBe(true)
  expect(quoteText({ text: 'hello there' }, ' there ')).toBe('there')
  expect(quoteText({ text: 'see', attachment: { kind: 'PDF', name: 'a.pdf' } })).toBe('see (a.pdf)')
  expect(quoteText({ text: '', attachment: { kind: 'PDF', name: 'a.pdf' } })).toBe('a.pdf')
})

test('mentions split only for known names', () => {
  expect(textParts('hi @you, and @ghost', ['you']).map(p => [p.mention, p.text])).toEqual([[false, 'hi '], [true, '@you'], [false, ', and @ghost']])
  expect(textParts('mail a@you.dev', ['you']).length).toBe(1)
})

test('the mention query reads the word at the caret, and inserting replaces it', () => {
  expect(mentionQuery('hey @me', 7)).toEqual({ start: 4, query: 'me' })
  expect(mentionQuery('a@b', 3)).toBeNull()
  expect(mentionQuery('hey @me there', 13)).toBeNull()
  expect(insertMention('hey @me!', 7, 'Mei')).toEqual({ value: 'hey @Mei !', caret: 9 })
})

test('reaction names list who', () => {
  expect(reactionName({ emoji: '👍', label: 'Thumbs up', count: 3, names: ['you', 'Ana', 'Kofi'] })).toBe('Thumbs up, 3: you, Ana, Kofi')
  expect(reactionName({ emoji: '🎉', count: 1, mine: true })).toBe('🎉, 1: you')
})

test('a cursor is its anchor plus a fraction, and says when it is off the layer', () => {
  const base = { left: 10, top: 10, height: 100 }
  expect(cursorPoint({ left: 20, top: 30, width: 100, height: 20 }, base, { x: 0.5, y: 0.5 })).toEqual({ x: 60, y: 30, over: 0 })
  expect(cursorPoint({ left: 20, top: -50, width: 100, height: 20 }, base, { x: 0, y: 0 }).over).toBe(-1)
  expect(cursorPoint({ left: 20, top: 500, width: 100, height: 20 }, base, { x: 0, y: 0 }).over).toBe(1)
})

const board = () => [{ id: 'a', title: 'A', cards: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] }, { id: 'b', title: 'B', cards: [{ id: '3', title: 'Three' }] }]

test('moving a card keeps the object, clamps, and leaves untouched columns alone', () => {
  const b = board()
  const next = moveCard(b, '1', 1, 9)
  expect(next[1]!.cards.map(c => c.id)).toEqual(['3', '1'])
  expect(next[1]!.cards[1]).toBe(b[0]!.cards[0])
  expect(moveCard(b, '1', 0, 1)[0]!.cards.map(c => c.id)).toEqual(['2', '1'])
  expect(moveCard(b, 'nope', 0, 0)).toEqual(b)
  expect(moveLine(next, '1')).toBe('Moved One to B, position 2 of 2')
  expect(findCard(next, '3')).toEqual({ col: 1, index: 0 })
})

test('arrow keys stop at the board edge', () => {
  const b = board()
  expect(stepCard(b, '1', 'ArrowLeft')).toBeNull()
  expect(stepCard(b, '1', 'ArrowUp')).toBeNull()
  expect(stepCard(b, '1', 'ArrowDown')).toEqual({ col: 0, index: 1 })
  expect(stepCard(b, '2', 'ArrowRight')).toEqual({ col: 1, index: 1 })
  expect(stepCard(b, '3', 'ArrowDown')).toBeNull()
  expect(stepCard(b, '1', 'q')).toBeNull()
})

test('integrity counts duplicates and reorders, p95 picks the tail', () => {
  const c = integrityCounter()
  c.send()
  expect(c.receive(1, 10)).toBe('ok')
  expect(c.receive(3, 20)).toBe('ok')
  expect(c.receive(3, 20)).toBe('duplicate')
  expect(c.receive(2, 30)).toBe('out-of-order')
  expect(c.stats).toMatchObject({ sent: 1, received: 4, duplicate: 1, outOfOrder: 1, lagP95: 30 })
  c.reset()
  expect(c.stats.received).toBe(0)
  expect(p95([])).toBe(0)
  expect(p95(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(96)
})

describe('syncedForm', () => {
  const op = (seq: number, value: string): FormOp => ({ seq, name: 't', value, peer: { id: 'ana', name: 'Ana', color: 1 } })
  const form = () => {
    const f = document.body.appendChild(document.createElement('form'))
    f.innerHTML = '<div data-scope="field"><input name="t" value="a"></div><select name="s"><option>x<option>y</select>'
    return { f, input: f.querySelector('input')!, root: f.querySelector<HTMLElement>('[data-scope="field"]')! }
  }
  afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers() })

  test('a remote edit applies, rings and tags for 1.4 s; a stale seq drops', () => {
    vi.useFakeTimers()
    const { f, input, root } = form()
    const a = syncedForm(f, { ops: [op(2, 'b')] })
    expect(input.value).toBe('b')
    expect(root.hasAttribute('data-remote')).toBe(true)
    const tag = f.querySelector<HTMLElement>('[data-part="peer-tag"]')!
    expect(tag.textContent).toBe('Ana edited')
    a.update({ ops: [op(2, 'b'), op(1, 'old')] })
    expect(input.value).toBe('b')
    vi.advanceTimersByTime(1400)
    expect(root.hasAttribute('data-remote')).toBe(false)
    expect(tag.hidden).toBe(true)
    a.destroy()
  })

  test('a focused field is never overwritten: the edit waits for blur', async () => {
    const { f, input } = form()
    input.focus()
    const a = syncedForm(f, { ops: [op(1, 'b')] })
    expect(input.value).toBe('a')
    expect(f.querySelector('[data-part="peer-tag"]')!.textContent).toContain('applies when you leave')
    input.blur()
    await Promise.resolve()
    expect(input.value).toBe('b')
    a.destroy()
  })

  test('a local edit sends once, on input', () => {
    const { f, input } = form()
    const sent: unknown[] = []
    const a = syncedForm(f, { ops: [], onSend: (n, v) => sent.push([n, v]) })
    input.value = 'c'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(sent).toEqual([['t', 'c']])
    a.destroy()
  })
})
