import { onTestFinished } from 'vitest'
// The collab pack driven as a user would (07 §5, §6; 06 §10).
import { fireEvent } from '@testing-library/dom'
import type { ChatMessage, CursorPeer, FormOp, Peer } from '@weft/ui-core'
import { state } from 'weft'
import { flush, render } from 'weft/test'
import { Toaster } from '../src/Toast'
import { AutoTrack } from '../src/collab/AutoTrack'
import { CommentAnchor, CommentRail, CommentThread, type CommentThreadData } from '../src/collab/Comments'
import { Composer } from '../src/collab/Composer'
import { ConversationList, type ChatConversation } from '../src/collab/ConversationList'
import { Cursors } from '../src/collab/Cursors'
import { DataIntegrity } from '../src/collab/DataIntegrity'
import { Kanban, type KanbanColumn } from '../src/collab/Kanban'
import { LockedField } from '../src/collab/Lock'
import { Following, PresenceStack } from '../src/collab/PresenceStack'
import { ShareDialog, type ShareLink, type ShareMember } from '../src/collab/ShareDialog'
import { ConflictAlert, SyncIndicator } from '../src/collab/Status'
import { SyncedForm } from '../src/collab/SyncedForm'
import { Thread } from '../src/collab/Thread'
import { SectionPeers, ViewportRail } from '../src/collab/ViewportRail'
import { VersionHistory, type Version } from '../src/collab/VersionHistory'

const mei: Peer = { id: 'mei', name: 'Mei Tanaka', color: 3 }
const ana: Peer = { id: 'ana', name: 'Ana Ruiz', color: 1 }
const kofi: Peer = { id: 'kofi', name: 'Kofi Mensah', color: 2 }
const me: Peer = { id: 'me', name: 'Jo', color: 6 }
const msg = (id: string, author: Peer, text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, author, text, time: '09:48', day: 'Today', ...extra })

const q = <T extends HTMLElement = HTMLElement>(r: ParentNode, s: string) => r.querySelector<T>(s)!
const qa = <T extends HTMLElement = HTMLElement>(r: ParentNode, s: string) => [...r.querySelectorAll<T>(s)]
const button = (r: ParentNode, name: string) => qa<HTMLButtonElement>(r, 'button').find(b => (b.getAttribute('aria-label') ?? b.textContent!.trim()) === name)!
const type = (el: HTMLTextAreaElement | HTMLInputElement, v: string) => { el.value = v; el.setSelectionRange?.(v.length, v.length); fireEvent.input(el) }
const polite = () => q(document, '[data-scope="announcer"][aria-live="polite"]').textContent
const loud = () => q(document, '[data-scope="announcer"][aria-live="assertive"]').textContent
const wait = (ms = 80) => new Promise(r => setTimeout(r, ms))
const tick = async () => { await Promise.resolve(); await flush(); await Promise.resolve() }

describe('Thread', () => {
  const base = () => [msg('a', ana, 'One', { at: 0 }), msg('b', ana, 'Two', { at: 60_000 }), msg('c', mei, 'Three @you', { at: 120_000, mentions: ['you'], reactions: [{ emoji: '👍', label: 'Thumbs up', count: 2, mine: true, names: ['you', 'Ana'] }] }), msg('d', me, 'Mine', { mine: true, state: 'read', readAt: '09:52', at: 180_000 })]
  const mount = (list: any, props: Record<string, any> = {}) => render(() => <><Thread label="c" messages={list} composer={{ label: 'Message' }} onSend={() => {}} {...props} /><Toaster /></>).container

  test('a log of articles with dividers, grouping, mention chips, reactions and one Read', async () => {
    const c = mount(base(), { unreadFrom: 'c' })
    await tick()
    expect(q(c, '[role="log"]')).toBeTruthy()
    expect(qa(c, '[data-part="divider"]').map(d => d.textContent)).toEqual(['Today', 'New'])
    expect(q(c, '[data-mid="b"]').hasAttribute('data-continued')).toBe(true)
    expect(q(c, '[data-mid="c"] [data-part="mention"]').textContent).toBe('@you')
    expect(q(c, '[data-mid="c"]').hasAttribute('data-mentions-me')).toBe(true)
    expect(q(c, '[data-scope="reactions"] button').getAttribute('aria-label')).toBe('Thumbs up, 2: you, Ana')
    expect(q(c, '[data-mid="d"] [data-part="status"]').textContent).toContain('Read 09:52')
  })

  test('live updates patch in place: the node survives, and only a new row arrives', async () => {
    const list = state(base())
    const c = mount(list)
    await tick()
    const node = q(c, '[data-mid="d"]')
    list.value = list.value.map(m => (m.id === 'd' ? { ...m, state: 'failed' as const } : m))
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

  test('Q quotes: the draft, focus to the textarea, Escape removes it; a bare quote never sends', async () => {
    const sent: any[] = []
    const c = mount(base(), { onSend: (x: any) => sent.push(x) })
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
    expect(sent[0].text).toBe('Yes')
    expect(sent[0].quote).toMatchObject({ ref: 'c', author: 'Mei Tanaka' })
    expect(c.querySelector('[data-part="quote-draft"]')).toBeNull()
    fireEvent.keyDown(q(c, '[data-mid="c"]'), { key: 'q' })
    await flush()
    fireEvent.keyDown(ta, { key: 'Escape' })
    await flush()
    expect(c.querySelector('[data-part="quote-draft"]')).toBeNull()
  })

  test('a sent quote jumps to its source; a deleted source says so, with no link', async () => {
    const list = [msg('a', ana, 'Source'), msg('b', mei, 'Reply', { quote: { ref: 'a', text: 'Source' } }), msg('c', mei, 'Orphan', { quote: { ref: 'gone', text: 'x' } })]
    const c = mount(list)
    await tick()
    expect(q(c, '[data-mid="b"] [data-part="quote-by"]').textContent).toContain('Quoting Ana Ruiz')
    expect(q(c, '[data-mid="b"]').getAttribute('aria-label')).toContain('quoting Ana Ruiz')
    q(c, '[data-mid="b"] [data-jump]').click()
    expect(document.activeElement).toBe(q(c, '[data-mid="a"]'))
    expect(q(c, '[data-mid="c"] [data-part="quote"]').textContent).toContain('Original message deleted')
    expect(c.querySelector('[data-mid="c"] [data-jump]')).toBeNull()
  })

  test('failed: critical state, Retry, announced assertively once', async () => {
    const list = state([msg('a', me, 'Hi', { mine: true, state: 'sending' })])
    const retried: string[] = []
    const c = mount(list, { onRetry: (m: ChatMessage) => retried.push(m.id) })
    await tick()
    expect(q(c, '[data-part="status"]').textContent).toContain('Sending…')
    list.value = [{ ...list.value[0], state: 'failed' }]
    await flush(); await wait()
    expect(loud()).toBe('Message not sent')
    q(c, '[data-mid="a"] [data-part="status"] button').click()
    expect(retried).toEqual(['a'])
  })

  test('away from the bottom: new messages count on Jump to latest, and it goes back', async () => {
    const box = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(100) // jsdom has no layout: the window reads this once, at the start
    onTestFinished(() => box.mockRestore())
    const list = state(base())
    const c = mount(list)
    await tick()
    const log = q(c, '[role="log"]')
    log.scrollTop = 0
    fireEvent.scroll(log)
    await wait(40); await flush()
    expect(c.querySelector('[data-part="jump"]')!.textContent).toBe('Jump to latest')
    list.value = [...list.value, msg('e', mei, 'New')]
    await flush(); await tick(); await flush()
    expect(q(c, '[data-part="jump"]').textContent).toBe('Jump to latest · 1 new')
    q(c, '[data-part="jump"]').click()
    await flush(); await tick(); await flush()
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
})

describe('Composer', () => {
  test('Enter sends and clears, Shift+Enter does not, an empty box does nothing', async () => {
    const sent: string[] = []
    const { container: c } = render(() => <Composer label="Message" onSend={m => sent.push(m.text)} />)
    const ta = q<HTMLTextAreaElement>(c, 'textarea')
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(sent).toEqual([])
    type(ta, 'hi')
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    expect(sent).toEqual([])
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(sent).toEqual(['hi'])
    expect(ta.value).toBe('')
    expect(q(c, 'label').getAttribute('for')).toBe(ta.id)
  })

  test('@ opens the listbox: arrows pick by activedescendant, Enter inserts, Escape closes', async () => {
    const sent: string[] = []
    const { container: c } = render(() => <Composer label="Message" onSend={m => sent.push(m.text)} mentions={[mei, ana, kofi]} />)
    const ta = q<HTMLTextAreaElement>(c, 'textarea')
    type(ta, 'hey @')
    await flush()
    expect(qa(c, '[role="option"]').length).toBe(3)
    expect(ta.getAttribute('aria-activedescendant')).toBe(qa(c, '[role="option"]')[0].id)
    fireEvent.keyDown(ta, { key: 'ArrowDown' })
    await flush()
    expect(qa(c, '[role="option"]')[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(ta, { key: 'Enter' })
    await flush()
    expect(ta.value).toBe('hey @Ana ')
    expect(sent).toEqual([])
    expect(c.querySelector('[role="listbox"]')).toBeNull()
    type(ta, '@ko')
    await flush()
    expect(qa(c, '[role="option"]').map(o => o.textContent)).toEqual(['KMKofi Mensah'])
    fireEvent.keyDown(ta, { key: 'Escape' })
    await flush()
    expect(c.querySelector('[role="listbox"]')).toBeNull()
  })

  test('the slots: attach calls out, emoji inserts at the caret, a file can be removed', async () => {
    let attached = 0
    const removed: string[] = []
    const { container: c } = render(() => <Composer label="Message" onSend={() => {}} onAttach={() => attached++} onEmoji={insert => insert('🎉')} files={[{ id: 'f', name: 'a.png' }]} onRemoveFile={f => removed.push(f.id)} />)
    button(c, 'Attach').click()
    expect(attached).toBe(1)
    button(c, 'Emoji').click()
    expect(q<HTMLTextAreaElement>(c, 'textarea').value).toBe('🎉')
    button(c, 'Remove a.png').click()
    expect(removed).toEqual(['f'])
  })
})

describe('ConversationList', () => {
  const items: ChatConversation[] = [{ id: 'a', name: '# one', channel: true, preview: 'p', time: '1', unread: 2 }, { id: 'b', name: 'Two', preview: 'p', time: '2' }, { id: 'c', name: 'Three', preview: 'p', time: '3', muted: true }]
  test('a listbox: one stop, arrows rove, a press selects', async () => {
    const value = state('a')
    const picked: string[] = []
    const { container: c } = render(() => <ConversationList items={items} value={value} onSelect={x => picked.push(x.id)} />)
    await tick()
    const opts = qa(c, '[role="option"]')
    expect(q(c, '[role="listbox"]').getAttribute('aria-label')).toBe('Conversations')
    expect(opts.map(o => o.tabIndex)).toEqual([0, -1, -1])
    expect(opts[0].getAttribute('aria-selected')).toBe('true')
    expect(opts[0].textContent).toContain('2 unread')
    expect(opts[2].hasAttribute('data-muted')).toBe(true)
    opts[0].focus()
    fireEvent.keyDown(opts[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(opts[1])
    opts[1].click()
    await flush()
    expect(value.value).toBe('b')
    expect(picked).toEqual(['b'])
    expect(opts[1].getAttribute('aria-selected')).toBe('true')
    expect(opts[1].tabIndex).toBe(0)
  })
})

describe('presence', () => {
  test('overflow opens a list; follow toggles; joins are summarised', async () => {
    const peers = state([mei, ana])
    const got: (Peer | null)[] = []
    const { container: c } = render(() => <><PresenceStack peers={peers} max={1} onFollow={p => got.push(p)} following="mei" /><Toaster /></>)
    await tick()
    const follow = qa<HTMLButtonElement>(c, 'button[aria-pressed]')[0]
    expect(follow.getAttribute('aria-pressed')).toBe('true')
    follow.click()
    expect(got).toEqual([null])
    expect(q(c, '[data-part="more"]').textContent).toBe('+1')
    q(c, '[data-part="more"]').click()
    await flush()
    expect(q(c, '[data-part="more"]').getAttribute('aria-expanded')).toBe('true')
    expect(q(c, '[role="dialog"] ul').textContent).toContain('Ana Ruiz')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    peers.value = [...peers.value, kofi]
    await flush()
    vi.advanceTimersByTime(1100)
    vi.useRealTimers()
    await wait()
    expect(polite()).toBe('Kofi joined')
  })

  test('following shows the flag and the frame; a wheel or Esc stops it', async () => {
    const peer = state<Peer | null>(mei)
    let stops = 0
    const { container: c } = render(() => <Following peer={peer.value} onStop={() => { stops++; peer.value = null }}><p>doc</p></Following>)
    await tick()
    expect(q(c, '[data-scope="follow-flag"]').textContent).toBe('Following Mei · Esc to stop')
    const frame = q(c, '[data-following]')
    expect(frame.dataset.presenceColor).toBe('3')
    fireEvent.keyDown(document, { key: 'Escape' })
    await flush()
    expect(stops).toBe(1)
    expect(c.querySelector('[data-following]')).toBeNull()
    peer.value = ana
    await flush(); await tick()
    fireEvent.wheel(frame)
    await flush()
    expect(stops).toBe(2)
  })

  test('cursors take their place from the anchor, hide without one, and fade when idle', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const peers = state<CursorPeer[]>([{ ...mei, cursor: { anchor: 'p', x: 0.5, y: 0 } }, { ...ana, cursor: { anchor: 'none', x: 0, y: 0 } }])
    const { container: c } = render(() => <div><p data-anchor="p">text</p><Cursors peers={peers} idle={5000} /></div>)
    await tick()
    const anchor = q(c, '[data-anchor]')
    anchor.getBoundingClientRect = () => ({ left: 100, top: 40, width: 200, height: 20 }) as DOMRect
    q(c, '[data-scope="cursors"]').getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 300 }) as DOMRect
    peers.value = [{ ...peers.value[0], cursor: { anchor: 'p', x: 0.25, y: 0.5 } }, peers.value[1]]
    await flush(); await tick()
    const cur = q(c, '[data-peer="mei"]')
    expect(cur.style.getPropertyValue('--_x')).toBe('150px')
    expect(cur.style.getPropertyValue('--_y')).toBe('50px')
    expect(q(c, '[data-peer="ana"]').hidden).toBe(true)
    expect(q(c, '[data-scope="cursors"]').getAttribute('aria-hidden')).toBe('true')
    vi.advanceTimersByTime(6000)
    expect(cur.hasAttribute('data-idle')).toBe(true)
    vi.useRealTimers()
  })

  test('a locked field is readonly, not disabled, and described by the chip', async () => {
    const { container: c } = render(() => <LockedField peer={kofi} label="Owner" value="Kofi" />)
    const input = q<HTMLInputElement>(c, 'input')
    expect(input.readOnly).toBe(true)
    expect(input.disabled).toBe(false)
    expect(input.getAttribute('aria-describedby')).toContain(q(c, '[data-scope="lock"]').id)
    expect(q(c, '[data-scope="lock"]').textContent).toContain('Kofi is editing')
  })

  test('the rail is a picture, or jump buttons; section peers name who is here', async () => {
    const jumped: string[] = []
    const { container: c } = render(() => <><ViewportRail peers={[{ ...mei, top: 0.1, height: 0.2 }]} onJump={p => jumped.push(p.id)} /><ViewportRail peers={[]} label="Still" /><SectionPeers peers={[mei, ana]} /></>)
    const box = q(c, '[data-scope="viewport-rail"] i')
    expect(box.style.getPropertyValue('--_t')).toBe('0.1')
    fireEvent.keyDown(box, { key: 'Enter' })
    box.click()
    expect(jumped).toEqual(['mei', 'mei'])
    expect(qa(c, '[data-scope="viewport-rail"]')[1].getAttribute('role')).toBe('img')
    expect(q(c, '[data-scope="section-peers"]').getAttribute('aria-label')).toBe('Mei and Ana are here')
  })
})

describe('status', () => {
  test('sync reads its state', () => {
    const { container: c } = render(() => <SyncIndicator state="offline" />)
    expect(q(c, '[data-scope="sync"]').textContent).toContain('Offline · changes kept')
    expect(q(c, '[data-scope="sync"]').getAttribute('role')).toBe('status')
  })

  test('a conflict shows both versions; each way out names itself and announces', async () => {
    const did: string[] = []
    const { container: c } = render(() => <><ConflictAlert field="Ship date" peer={ana} time="10:31" theirs="Nov 25" yours="Nov 18" onUseTheirs={() => did.push('theirs')} onKeepMine={() => did.push('mine')} /><Toaster /></>)
    expect(q(c, '[role="alert"]').textContent).toContain('Ana changed “Ship date”')
    expect(q(c, 'ins').textContent).toBe('Nov 25')
    expect(q(c, 'del').textContent).toBe('Nov 18')
    expect(button(c, 'Compare')).toBeUndefined()
    button(c, 'Use theirs').click()
    button(c, 'Keep mine').click()
    expect(did).toEqual(['theirs', 'mine'])
    await wait()
    expect(polite()).toBe('Conflict resolved')
  })
})

describe('comments', () => {
  const data: CommentThreadData = { id: 't', comments: [{ id: 'a', author: mei, time: '10', text: 'First' }, { id: 'b', author: ana, time: '11', text: 'Second' }] }
  test('Enter replies; Resolve collapses to one line with Reopen', async () => {
    const replies: string[] = []
    const resolved: boolean[] = []
    const { container: c } = render(() => <><CommentThread thread={data} onReply={t => replies.push(t)} onResolve={r => resolved.push(r)} /><Toaster /></>)
    const input = q<HTMLInputElement>(c, 'input')
    type(input, 'Yes')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(replies).toEqual(['Yes'])
    expect(input.value).toBe('')
    expect(q(c, 'label').getAttribute('for')).toBe(input.id)
    button(c, 'Resolve').click()
    await flush()
    const art = q(c, 'article')
    expect(art.hasAttribute('data-resolved')).toBe(true)
    expect(qa(c, '[data-part="comment"]').length).toBe(0)
    expect(art.textContent).toContain('Mei Tanaka: First')
    button(c, 'Reopen').click()
    await flush()
    expect(qa(c, '[data-part="comment"]').length).toBe(2)
    expect(resolved).toEqual([true, false])
  })

  test('a new comment arrives, an old one does not', async () => {
    const thread = state(data)
    const { container: c } = render(() => <CommentThread thread={thread} />)
    await flush()
    thread.value = { ...data, comments: [...data.comments, { id: 'c', author: me, time: '12', text: 'Third' }] }
    await flush()
    expect(qa(c, '[data-part="comment"]').map(x => x.hasAttribute('data-arrive'))).toEqual([false, false, true])
  })

  test('an anchor activates its thread in the complementary rail', async () => {
    const active = state<string | null>(null)
    const { container: c } = render(() => <><CommentAnchor thread="t" active={active}>range</CommentAnchor><CommentRail threads={[data]} active={active} /></>)
    await tick()
    expect(q(c, 'aside').getAttribute('aria-label')).toBe('Comments')
    q(c, '[data-scope="comment-anchor"]').click()
    await flush()
    expect(q(c, '[data-scope="comment-anchor"]').hasAttribute('data-active')).toBe(true)
    expect(q(c, 'article').hasAttribute('data-active')).toBe(true)
    expect(q(c, 'article').hasAttribute('data-pin')).toBe(true)
  })
})

describe('ShareDialog', () => {
  const setup = () => {
    const open = state(true)
    const members = state<ShareMember[]>([{ ...me, email: 'jo@x', role: 'owner' }, { ...mei, email: 'mei@x', role: 'editor' }])
    const link = state<ShareLink>({ access: 'restricted', role: 'viewer' })
    const log: any[] = []
    const { container: c } = render(() => <><ShareDialog open={open} title="Q4" members={members} link={link} url="https://x" onInvite={(e, r) => log.push(['invite', e, r])} onRoleChange={(m, r) => log.push(['role', m.id, r])} onLinkAccess={l => { link.value = l; log.push(['link', l.access]) }} /><Toaster /></>)
    return { c, members, log, open }
  }
  test('invites by email with the chosen role; invited rows arrive', async () => {
    const { c, members, log } = setup()
    await tick()
    const input = q<HTMLInputElement>(c, '[data-scope="field"] input')
    type(input, 'new@x.co')
    await flush()
    fireEvent.submit(q(c, 'form'))
    await flush()
    expect(q(c, '[data-scope="tag"]').textContent).toContain('new@x.co')
    button(c, 'Invite').click()
    expect(log).toEqual([['invite', ['new@x.co'], 'editor']])
    await flush()
    expect(c.querySelector('[data-scope="tag"]')).toBeNull()
    members.value = [...members.value, { ...ana, email: 'new@x.co', role: 'editor' }]
    await flush()
    expect(qa(c, '[data-part="person"]')[2].hasAttribute('data-arrive')).toBe(true)
    expect(qa(c, '[data-part="person"]')[1].hasAttribute('data-arrive')).toBe(false)
  })

  test('the owner has no select; a role change and Remove report; link access opens its role', async () => {
    const { c, log } = setup()
    await tick()
    const people = qa(c, '[data-part="person"]')
    expect(people[0].querySelector('select')).toBeNull()
    const sel = q<HTMLSelectElement>(people[1], 'select')
    expect(sel.value).toBe('editor')
    sel.value = 'viewer'; fireEvent.change(sel)
    sel.value = 'remove'; fireEvent.change(sel)
    expect(log).toEqual([['role', 'mei', 'viewer'], ['role', 'mei', null]])
    const access = q<HTMLSelectElement>(c, '[data-part="link"] select')
    access.value = 'anyone'; fireEvent.change(access)
    await flush()
    expect(qa(c, '[data-part="link"] select').length).toBe(2)
  })

  test('Copy link confirms and announces', async () => {
    const { c } = setup()
    await tick()
    button(c, 'Copy link').click()
    await flush(); await wait()
    expect(button(c, 'Copied')).toBeTruthy()
    expect(polite()).toBe('Link copied')
  })
})

describe('VersionHistory', () => {
  const versions: Version[] = [{ id: '2', title: 'Current', meta: 'now', current: true }, { id: '1', title: 'Draft', meta: 'Mon', named: true }]
  test('Preview shows it read-only, Restore asks first, and only then restores', async () => {
    const restored: string[] = []
    const { container: c } = render(() => <><VersionHistory versions={versions} preview={v => <input aria-label={v.title} />} onRestore={v => restored.push(v.id)} /><Toaster /></>)
    await tick()
    const lis = qa(c, 'li')
    expect(lis[0].getAttribute('aria-current')).toBe('true')
    expect(lis[1].hasAttribute('data-named')).toBe(true)
    expect(lis[0].querySelector('button')).toBeNull()
    button(c, 'Preview Draft').click()
    await flush(); await tick()
    expect(q(c, 'dialog [inert] input')).toBeTruthy()
    qa(c, 'dialog')[0].querySelector<HTMLElement>('[data-part="footer"] button')!.click()
    await flush(); await tick()
    expect(restored).toEqual([])
    expect(q(c, '[role="alertdialog"]').textContent).toContain('Restoring creates a new version')
    button(q(c, '[role="alertdialog"]'), 'Restore').click()
    await flush(); await wait()
    expect(restored).toEqual(['1'])
    expect(polite()).toBe('Restored Draft as a new version')
  })
})

describe('Kanban', () => {
  const data = (): KanbanColumn[] => [
    { id: 'a', title: 'To do', cards: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] },
    { id: 'b', title: 'Doing', limit: 1, cards: [{ id: '3', title: 'Three' }, { id: '4', title: 'Four' }] },
  ]
  const mount = () => {
    const moves: any[] = []
    const { container: c } = render(() => <><Kanban columns={data()} onMove={(id, col, i) => moves.push([id, col, i])} /><Toaster /></>)
    const titles = () => qa(c, '[data-part="column"]').map(col => qa(col, '[data-part="row"]').sort((a, b) => Number(a.getAttribute('aria-posinset')) - Number(b.getAttribute('aria-posinset'))).map(r => r.querySelector('h4')!.textContent))
    const card = (id: string) => q(c, `[data-part="card"][data-id="${id}"]`)
    return { c, moves, titles, card }
  }
  test('sections of ordered lists, count and limit, caution when over', async () => {
    const { c } = mount()
    await tick()
    const cols = qa(c, 'section[data-part="column"]')
    expect(cols.length).toBe(2)
    expect(q(cols[1], '[data-part="count"]').textContent).toBe('2 / 1')
    expect(cols[1].hasAttribute('data-over-limit')).toBe(true)
    expect(cols[0].hasAttribute('data-over-limit')).toBe(false)
    expect(q(cols[0], 'ol li [data-part="card"]').getAttribute('draggable')).toBe('true')
  })

  test('Alt + arrows move and announce; the same node reorders; focus follows across columns', async () => {
    const { card, titles, moves } = mount()
    await tick()
    const one = card('1')
    one.focus()
    fireEvent.keyDown(one, { key: 'ArrowDown', altKey: true })
    await tick()
    expect(titles()[0]).toEqual(['Two', 'One'])
    expect(card('1')).toBe(one)
    expect(document.activeElement).toBe(one)
    await wait()
    expect(polite()).toBe('Moved One to To do, position 2 of 2')
    fireEvent.keyDown(one, { key: 'ArrowRight', altKey: true })
    await tick()
    expect(titles()).toEqual([['Two'], ['Three', 'One', 'Four']])
    expect(document.activeElement).toBe(card('1'))
    expect(moves.at(-1)).toEqual(['1', 'b', 1])
    await wait()
    expect(polite()).toBe('Moved One to Doing, position 2 of 3')
  })

  test('Space lifts, arrows carry, Space drops; Escape puts it back', async () => {
    const { card, titles } = mount()
    await tick()
    card('1').focus()
    fireEvent.keyDown(card('1'), { key: ' ' })
    expect(card('1').hasAttribute('data-dragging')).toBe(true)
    await wait()
    expect(polite()).toContain('Picked up One')
    fireEvent.keyDown(card('1'), { key: 'ArrowRight' })
    await tick()
    expect(titles()[1]).toContain('One')
    expect(card('1').hasAttribute('data-dragging')).toBe(true)
    fireEvent.keyDown(card('1'), { key: ' ' })
    expect(card('1').hasAttribute('data-dragging')).toBe(false)
    fireEvent.keyDown(card('1'), { key: ' ' })
    fireEvent.keyDown(card('1'), { key: 'ArrowDown' })
    await tick()
    fireEvent.keyDown(card('1'), { key: 'Escape' })
    await tick()
    expect(titles()[1].indexOf('One')).toBe(0)
    expect(card('1').hasAttribute('data-dragging')).toBe(false)
  })

  test('the Move menu lists each column, the current one disabled, and moves', async () => {
    const { c, card, titles } = mount()
    await tick()
    q(card('1'), '[data-part="move"]').click()
    await flush(); await tick()
    const items = qa(card('1'), '[role="menuitem"]')
    expect(items.map(i => i.textContent)).toEqual(['Move to To do', 'Move to Doing', 'Move up', 'Move down'])
    expect(items[0].getAttribute('aria-disabled')).toBe('true')
    items[1].click()
    await flush(); await wait(20)
    expect(titles()[1]).toEqual(['Three', 'Four', 'One'])
    expect(document.activeElement).toBe(q(c, '[data-id="1"]'))
  })

  test('on a phone Move opens a sheet', async () => {
    const spy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    const { c, card, titles } = mount()
    await tick()
    q(card('1'), '[data-part="move"]').click()
    await flush(); await tick()
    expect(q(c, 'dialog[data-scope="sheet"]').textContent).toContain('Move One')
    expect(card('1').querySelector('[role="menuitem"]')).toBeNull()
    button(q(c, 'dialog'), 'Move to Doing').click()
    await flush(); await wait(20)
    expect(titles()[1]).toEqual(['Three', 'Four', 'One'])
    spy.mockRestore()
  })

  test('a drag drops into the column under it', async () => {
    const { c, card, titles } = mount()
    await tick()
    const dt = { setData() {}, effectAllowed: '' }
    fireEvent.dragStart(card('1'), { dataTransfer: dt })
    const col = qa(c, '[data-part="column"]')[1]
    fireEvent.dragOver(q(col, 'ol'), { dataTransfer: dt, clientY: 0 })
    expect(col.hasAttribute('data-drop')).toBe(true)
    expect(q(col, '[data-part="placeholder"]')).toBeTruthy()
    fireEvent.drop(q(col, 'ol'), { dataTransfer: dt })
    fireEvent.dragEnd(card('1'))
    await flush()
    expect(titles()[1]).toContain('One')
    expect(c.querySelector('[data-part="placeholder"]')).toBeNull()
    expect(col.hasAttribute('data-drop')).toBe(false)
  })

  test('quick add calls out with the column', async () => {
    const added: string[][] = []
    const { container: c } = render(() => <Kanban columns={data()} onAdd={(col, t) => added.push([col, t])} />)
    button(c, 'Add card').click()
    await flush()
    const input = q<HTMLInputElement>(c, 'form input')
    input.value = 'New'
    fireEvent.submit(q(c, 'form'))
    expect(added).toEqual([['a', 'New']])
  })
})

describe('SyncedForm, DataIntegrity, AutoTrack', () => {
  test('a form applies ops from a signal and sends local edits', async () => {
    const ops = state<FormOp[]>([])
    const sent: any[] = []
    const { container: c } = render(() => <SyncedForm ops={ops} label="Copy" onSend={(n, v) => sent.push([n, v])}><input name="t" aria-label="T" /></SyncedForm>)
    await tick()
    ops.value = [{ seq: 1, name: 't', value: 'hi', peer: ana }]
    await flush(); await tick()
    const input = q<HTMLInputElement>(c, 'input')
    expect(input.value).toBe('hi')
    input.value = 'x'; fireEvent.input(input)
    expect(sent).toEqual([['t', 'x']])
    expect(q(c, 'form').getAttribute('aria-label')).toBe('Copy')
  })

  test('integrity tones and controls', () => {
    let hits = 0
    const { container: c } = render(() => <DataIntegrity channel="x" stats={{ sent: 1, received: 1, duplicate: 1, outOfOrder: 2, lagP95: 9 }} events={[{ id: 'a', seq: 1, kind: 't', route: 'r', note: 'n', lag: 3 }]} onReset={() => hits++} />)
    const dds = qa(c, 'dd')
    expect(dds.map(d => d.dataset.tone)).toEqual([undefined, undefined, 'caution', 'critical', undefined])
    expect(dds[4].textContent).toBe('9 ms')
    expect(q(c, 'ol li').textContent).toContain('r · n')
    button(c, 'Reset counts').click()
    expect(hits).toBe(1)
  })

  test('auto-track follows, a manual scroll pauses, Resume picks it up, the Switch turns it off', async () => {
    const { container: c } = render(() => <><AutoTrack presenter={kofi} section="a" label="Doc"><section data-section="a">A</section></AutoTrack><Toaster /></>)
    await tick()
    const status = q(c, '[data-scope="auto-track"]')
    expect(status.textContent).toContain('Following Kofi · presenting')
    const region = q(c, '[role="region"]')
    const scrolled = vi.fn()
    region.scrollTo = scrolled as any
    fireEvent.wheel(region)
    await flush()
    expect(status.dataset.state).toBe('paused')
    expect(status.textContent).toContain('Paused: you scrolled')
    button(c, 'Resume').click()
    await flush(); await tick()
    expect(status.dataset.state).toBe('following')
    expect(scrolled).toHaveBeenCalled()
    q(c, 'input[role="switch"]').click()
    await flush()
    expect(status.textContent).toContain('Off')
  })
})
