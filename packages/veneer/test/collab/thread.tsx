import { fireEvent } from '@testing-library/dom'
import { state, type State } from '@kerf-js/core'
import { flush, render } from '@kerf-js/core/test'
import type { ChatMessage } from '@kerf-js/veneer-core'
import { onTestFinished } from 'vitest'
import { Toaster } from '../../src/Toast'
import { Thread } from '../../src/collab/Thread'
import { wait } from '../timers.mjs'
import { ana, loud, me, mei, msg, polite, q, qa, tick, type } from './support'

function suiteContext() {
  const base = () => [
    msg('a', ana, 'One', { at: 0 }),
    msg('b', ana, 'Two', { at: 60_000 }),
    msg('c', mei, 'Three @you', {
      at: 120_000,
      mentions: ['you'],
      reactions: [{ emoji: '👍', label: 'Thumbs up', count: 2, mine: true, names: ['you', 'Ana'] }],
    }),
    msg('d', me, 'Mine', { mine: true, state: 'read', readAt: '09:52', at: 180_000 }),
  ]
  const mount = (list: ChatMessage[] | State<ChatMessage[]>, props: Record<string, unknown> = {}) =>
    render(() => (
      <>
        <Thread
          label="c"
          messages={list}
          composer={{ label: 'Message' }}
          onSend={() => {}}
          {...props}
        />
        <Toaster />
      </>
    )).container
  return { base, mount }
}

function registerALogOfArticlesWith(ctx: ReturnType<typeof suiteContext>) {
  const { base, mount } = ctx
  test('a log of articles with dividers, grouping, mention chips, reactions and one Read', async () => {
    const c = mount(base(), { unreadFrom: 'c' })
    await tick()
    expect(q(c, '[role="log"]')).toBeTruthy()
    expect(qa(c, '[data-part="divider"]').map((d) => d.textContent)).toEqual(['Today', 'New'])
    expect(q(c, '[data-mid="b"]').hasAttribute('data-continued')).toBe(true)
    expect(q(c, '[data-mid="c"] [data-part="mention"]').textContent).toBe('@you')
    expect(q(c, '[data-mid="c"]').hasAttribute('data-mentions-me')).toBe(true)
    expect(q(c, '[data-scope="reactions"] button').getAttribute('aria-label')).toBe(
      'Thumbs up, 2: you, Ana',
    )
    expect(q(c, '[data-mid="d"] [data-part="status"]').textContent).toContain('Read 09:52')
  })
  test('live updates patch in place: the node survives, and only a new row arrives', async () => {
    const list = state(base())
    const c = mount(list)
    await tick()
    const node = q(c, '[data-mid="d"]')
    list.value = list.value.map((m) => (m.id === 'd' ? { ...m, state: 'failed' as const } : m))
    await flush()
    expect(q(c, '[data-mid="d"]')).toBe(node)
    expect(node.dataset.state).toBe('failed')
    expect(node.hasAttribute('data-arrive')).toBe(false)
    list.value = [...list.value, msg('e', mei, 'New')]
    await flush()
    expect(q(c, '[data-mid="e"]').hasAttribute('data-arrive')).toBe(true)
  })
  test('messages rove with ↑/↓, Home and End; the focused toolbar joins the tab order', async () => {
    const c = mount(base())
    await tick()
    const m = (id: string) => q(c, `[data-mid="${id}"]`)
    expect(m('d').tabIndex).toBe(0)
    expect(m('a').tabIndex).toBe(-1)
    m('d').focus()
    fireEvent.keyDown(m('d'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(m('c'))
    expect(m('c').tabIndex).toBe(0)
    expect(q(m('c'), '[data-quote]').tabIndex).toBe(0)
    expect(q(m('d'), '[data-quote]').tabIndex).toBe(-1)
    fireEvent.keyDown(m('c'), { key: 'Home' })
    expect(document.activeElement).toBe(m('a'))
    fireEvent.keyDown(m('a'), { key: 'End' })
    expect(document.activeElement).toBe(m('d'))
  })
}

function registerQQuotesTheDraftFocus(ctx: ReturnType<typeof suiteContext>) {
  const { base, mount } = ctx
  test('Q quotes: the draft, focus to the textarea, Escape removes it; a bare quote never sends', async () => {
    const sent: { text: string; quote?: unknown }[] = []
    const c = mount(base(), { onSend: (x: { text: string }) => sent.push(x) })
    await tick()
    q(c, '[data-mid="c"]').focus()
    fireEvent.keyDown(q(c, '[data-mid="c"]'), { key: 'q' })
    await flush()
    const ta = q<HTMLTextAreaElement>(c, 'textarea')
    expect(document.activeElement).toBe(ta)
    expect(q(c, '[data-part="quote-draft"]').getAttribute('aria-label')).toBe('Quoting Mei Tanaka')
    await wait()
    expect(polite()).toBe('Quoting Mei Tanaka. Escape removes the quote.')
    fireEvent.keyDown(ta, { key: 'Enter' })
    await flush()
    expect(sent).toEqual([])
    expect(q(c, '[data-part="hint"]').textContent).toBe('Add a reply to the quote')
    expect(q(c, '[data-part="hint"]').dataset.state).toBe('error')
    type(ta, 'Yes')
    fireEvent.keyDown(ta, { key: 'Enter' })
    await flush()
    expect(sent[0]!.text).toBe('Yes')
    expect(sent[0]!.quote).toMatchObject({ ref: 'c', author: 'Mei Tanaka' })
    expect(c.querySelector('[data-part="quote-draft"]')).toBeNull()
    fireEvent.keyDown(q(c, '[data-mid="c"]'), { key: 'q' })
    await flush()
    fireEvent.keyDown(ta, { key: 'Escape' })
    await flush()
    expect(c.querySelector('[data-part="quote-draft"]')).toBeNull()
  })
  test('a sent quote jumps to its source; a deleted source says so, with no link', async () => {
    const list = [
      msg('a', ana, 'Source'),
      msg('b', mei, 'Reply', { quote: { ref: 'a', text: 'Source' } }),
      msg('c', mei, 'Orphan', { quote: { ref: 'gone', text: 'x' } }),
    ]
    const c = mount(list)
    await tick()
    expect(q(c, '[data-mid="b"] [data-part="quote-by"]').textContent).toContain('Quoting Ana Ruiz')
    expect(q(c, '[data-mid="b"]').getAttribute('aria-label')).toContain('quoting Ana Ruiz')
    q(c, '[data-mid="b"] [data-jump]').click()
    expect(document.activeElement).toBe(q(c, '[data-mid="a"]'))
    expect(q(c, '[data-mid="c"] [data-part="quote"]').textContent).toContain(
      'Original message deleted',
    )
    expect(c.querySelector('[data-mid="c"] [data-jump]')).toBeNull()
  })
  test('failed: critical state, Retry, announced assertively once', async () => {
    const list = state([msg('a', me, 'Hi', { mine: true, state: 'sending' })])
    const retried: string[] = []
    const c = mount(list, { onRetry: (m: ChatMessage) => retried.push(m.id) })
    await tick()
    expect(q(c, '[data-part="status"]').textContent).toContain('Sending…')
    list.value = [{ ...list.value[0]!, state: 'failed' }]
    await flush()
    await wait()
    expect(loud()).toBe('Message not sent')
    q(c, '[data-mid="a"] [data-part="status"] button').click()
    expect(retried).toEqual(['a'])
  })
}

function registerAwayFromTheBottomNew(ctx: ReturnType<typeof suiteContext>) {
  const { base, mount } = ctx
  test('away from the bottom: new messages count on Jump to latest, and it goes back', async () => {
    const box = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(100) // jsdom has no layout: the window reads this once, at the start
    onTestFinished(() => box.mockRestore())
    const list = state(base())
    const c = mount(list)
    await tick()
    const log = q(c, '[role="log"]')
    log.scrollTop = 0
    fireEvent.scroll(log)
    await wait(40)
    await flush()
    expect(c.querySelector('[data-part="jump"]')!.textContent).toBe('Jump to latest')
    list.value = [...list.value, msg('e', mei, 'New')]
    await flush()
    await tick()
    await flush()
    expect(q(c, '[data-part="jump"]').textContent).toBe('Jump to latest · 1 new')
    q(c, '[data-part="jump"]').click()
    await flush()
    await tick()
    await flush()
    expect(log.scrollTop).toBeGreaterThan(0)
    expect(c.querySelector('[data-part="jump"]')).toBeNull()
    expect(document.activeElement).toBe(q(c, '[data-mid="e"]'))
  })
  test('new messages are announced as one summary, typing shows in a line', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const list = state(base())
    const c = mount(list, { typing: ['Mei Tanaka'] })
    await tick()
    expect(q(c, '[data-scope="typing"]').textContent).toContain('Mei Tanaka is typing…')
    list.value = [...list.value, msg('e', mei, 'x')]
    await flush()
    list.value = [...list.value, msg('f', mei, 'y')]
    await flush()
    vi.advanceTimersByTime(1100)
    expect(polite()).toBe('2 new messages from Mei')
    vi.useRealTimers()
  })
}

export function registerThread() {
  describe('Thread', () => {
    const ctx = suiteContext()
    registerALogOfArticlesWith(ctx)
    registerQQuotesTheDraftFocus(ctx)
    registerAwayFromTheBottomNew(ctx)
  })
}
