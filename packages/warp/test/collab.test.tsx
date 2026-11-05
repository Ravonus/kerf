import { registerKanban } from './collab/kanban'
import { registerPresence } from './collab/presence'
import { registerShareDialog } from './collab/share-dialog'
import { ana, button, kofi, me, mei, polite, q, qa, tick, type } from './collab/support'
import { registerThread } from './collab/thread'
import { wait } from './timers.mjs'
// The collab pack driven as a user would (07 §5, §6; 06 §10).
import { fireEvent } from '@testing-library/dom'
import { state } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import type { FormOp } from '@weft-js/warp-core'
import { Toaster } from '../src/Toast'
import { AutoTrack } from '../src/collab/AutoTrack'
import {
  CommentAnchor,
  CommentRail,
  CommentThread,
  type CommentThreadData,
} from '../src/collab/Comments'
import { Composer } from '../src/collab/Composer'
import { ConversationList, type ChatConversation } from '../src/collab/ConversationList'
import { DataIntegrity } from '../src/collab/DataIntegrity'
import { ConflictAlert, SyncIndicator } from '../src/collab/Status'
import { SyncedForm } from '../src/collab/SyncedForm'
import { VersionHistory, type Version } from '../src/collab/VersionHistory'

registerThread()

describe('Composer', () => {
  test('Enter sends and clears, Shift+Enter does not, an empty box does nothing', () => {
    const sent: string[] = []
    const { container: c } = render(() => (
      <Composer label="Message" onSend={(m) => sent.push(m.text)} />
    ))
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
    const { container: c } = render(() => (
      <Composer label="Message" onSend={(m) => sent.push(m.text)} mentions={[mei, ana, kofi]} />
    ))
    const ta = q<HTMLTextAreaElement>(c, 'textarea')
    type(ta, 'hey @')
    await flush()
    expect(qa(c, '[role="option"]').length).toBe(3)
    expect(ta.getAttribute('aria-activedescendant')).toBe(qa(c, '[role="option"]')[0]!.id)
    fireEvent.keyDown(ta, { key: 'ArrowDown' })
    await flush()
    expect(qa(c, '[role="option"]')[1]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(ta, { key: 'Enter' })
    await flush()
    expect(ta.value).toBe('hey @Ana ')
    expect(sent).toEqual([])
    expect(c.querySelector('[role="listbox"]')).toBeNull()
    type(ta, '@ko')
    await flush()
    expect(qa(c, '[role="option"]').map((o) => o.textContent)).toEqual(['KMKofi Mensah'])
    fireEvent.keyDown(ta, { key: 'Escape' })
    await flush()
    expect(c.querySelector('[role="listbox"]')).toBeNull()
  })

  test('the slots: attach calls out, emoji inserts at the caret, a file can be removed', () => {
    let attached = 0
    const removed: string[] = []
    const { container: c } = render(() => (
      <Composer
        label="Message"
        onSend={() => {}}
        onAttach={() => attached++}
        onEmoji={(insert) => insert('🎉')}
        files={[{ id: 'f', name: 'a.png' }]}
        onRemoveFile={(f) => removed.push(f.id)}
      />
    ))
    button(c, 'Attach').click()
    expect(attached).toBe(1)
    button(c, 'Emoji').click()
    expect(q<HTMLTextAreaElement>(c, 'textarea').value).toBe('🎉')
    button(c, 'Remove a.png').click()
    expect(removed).toEqual(['f'])
  })
})

describe('ConversationList', () => {
  const items: ChatConversation[] = [
    { id: 'a', name: '# one', channel: true, preview: 'p', time: '1', unread: 2 },
    { id: 'b', name: 'Two', preview: 'p', time: '2' },
    { id: 'c', name: 'Three', preview: 'p', time: '3', muted: true },
  ]
  test('a listbox: one stop, arrows rove, a press selects', async () => {
    const value = state('a')
    const picked: string[] = []
    const { container: c } = render(() => (
      <ConversationList items={items} value={value} onSelect={(x) => picked.push(x.id)} />
    ))
    await tick()
    const opts = qa(c, '[role="option"]')
    expect(q(c, '[role="listbox"]').getAttribute('aria-label')).toBe('Conversations')
    expect(opts.map((o) => o.tabIndex)).toEqual([0, -1, -1])
    expect(opts[0]!.getAttribute('aria-selected')).toBe('true')
    expect(opts[0]!.textContent).toContain('2 unread')
    expect(opts[2]!.hasAttribute('data-muted')).toBe(true)
    opts[0]!.focus()
    fireEvent.keyDown(opts[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(opts[1])
    opts[1]!.click()
    await flush()
    expect(value.value).toBe('b')
    expect(picked).toEqual(['b'])
    expect(opts[1]!.getAttribute('aria-selected')).toBe('true')
    expect(opts[1]!.tabIndex).toBe(0)
  })
})

registerPresence()

describe('status', () => {
  test('sync reads its state', () => {
    const { container: c } = render(() => <SyncIndicator state="offline" />)
    expect(q(c, '[data-scope="sync"]').textContent).toContain('Offline · changes kept')
    expect(q(c, '[data-scope="sync"]').getAttribute('role')).toBe('status')
  })

  test('a conflict shows both versions; each way out names itself and announces', async () => {
    const did: string[] = []
    const { container: c } = render(() => (
      <>
        <ConflictAlert
          field="Ship date"
          peer={ana}
          time="10:31"
          theirs="Nov 25"
          yours="Nov 18"
          onUseTheirs={() => did.push('theirs')}
          onKeepMine={() => did.push('mine')}
        />
        <Toaster />
      </>
    ))
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
  const data: CommentThreadData = {
    id: 't',
    comments: [
      { id: 'a', author: mei, time: '10', text: 'First' },
      { id: 'b', author: ana, time: '11', text: 'Second' },
    ],
  }
  test('Enter replies; Resolve collapses to one line with Reopen', async () => {
    const replies: string[] = []
    const resolved: boolean[] = []
    const { container: c } = render(() => (
      <>
        <CommentThread
          thread={data}
          onReply={(t) => replies.push(t)}
          onResolve={(r) => resolved.push(r)}
        />
        <Toaster />
      </>
    ))
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
    thread.value = {
      ...data,
      comments: [...data.comments, { id: 'c', author: me, time: '12', text: 'Third' }],
    }
    await flush()
    expect(qa(c, '[data-part="comment"]').map((x) => x.hasAttribute('data-arrive'))).toEqual([
      false,
      false,
      true,
    ])
  })

  test('an anchor activates its thread in the complementary rail', async () => {
    const active = state<string | null>(null)
    const { container: c } = render(() => (
      <>
        <CommentAnchor thread="t" active={active}>
          range
        </CommentAnchor>
        <CommentRail threads={[data]} active={active} />
      </>
    ))
    await tick()
    expect(q(c, 'aside').getAttribute('aria-label')).toBe('Comments')
    q(c, '[data-scope="comment-anchor"]').click()
    await flush()
    expect(q(c, '[data-scope="comment-anchor"]').hasAttribute('data-active')).toBe(true)
    expect(q(c, 'article').hasAttribute('data-active')).toBe(true)
    expect(q(c, 'article').hasAttribute('data-pin')).toBe(true)
  })
})

registerShareDialog()

describe('VersionHistory', () => {
  const versions: Version[] = [
    { id: '2', title: 'Current', meta: 'now', current: true },
    { id: '1', title: 'Draft', meta: 'Mon', named: true },
  ]
  test('Preview shows it read-only, Restore asks first, and only then restores', async () => {
    const restored: string[] = []
    const { container: c } = render(() => (
      <>
        <VersionHistory
          versions={versions}
          preview={(v) => <input aria-label={v.title} />}
          onRestore={(v) => restored.push(v.id)}
        />
        <Toaster />
      </>
    ))
    await tick()
    const lis = qa(c, 'li')
    expect(lis[0]!.getAttribute('aria-current')).toBe('true')
    expect(lis[1]!.hasAttribute('data-named')).toBe(true)
    expect(lis[0]!.querySelector('button')).toBeNull()
    button(c, 'Preview Draft').click()
    await flush()
    await tick()
    expect(q(c, 'dialog [inert] input')).toBeTruthy()
    qa(c, 'dialog')[0]!.querySelector<HTMLElement>('[data-part="footer"] button')!.click()
    await flush()
    await tick()
    expect(restored).toEqual([])
    expect(q(c, '[role="alertdialog"]').textContent).toContain('Restoring creates a new version')
    button(q(c, '[role="alertdialog"]'), 'Restore').click()
    await flush()
    await wait()
    expect(restored).toEqual(['1'])
    expect(polite()).toBe('Restored Draft as a new version')
  })
})

registerKanban()

describe('SyncedForm, DataIntegrity, AutoTrack', () => {
  test('a form applies ops from a signal and sends local edits', async () => {
    const ops = state<FormOp[]>([])
    const sent: unknown[] = []
    const { container: c } = render(() => (
      <SyncedForm ops={ops} label="Copy" onSend={(n, v) => sent.push([n, v])}>
        <input name="t" aria-label="T" />
      </SyncedForm>
    ))
    await tick()
    ops.value = [{ seq: 1, name: 't', value: 'hi', peer: ana }]
    await flush()
    await tick()
    const input = q<HTMLInputElement>(c, 'input')
    expect(input.value).toBe('hi')
    input.value = 'x'
    fireEvent.input(input)
    expect(sent).toEqual([['t', 'x']])
    expect(q(c, 'form').getAttribute('aria-label')).toBe('Copy')
  })

  test('integrity tones and controls', () => {
    let hits = 0
    const { container: c } = render(() => (
      <DataIntegrity
        channel="x"
        stats={{ sent: 1, received: 1, duplicate: 1, outOfOrder: 2, lagP95: 9 }}
        events={[{ id: 'a', seq: 1, kind: 't', route: 'r', note: 'n', lag: 3 }]}
        onReset={() => hits++}
      />
    ))
    const dds = qa(c, 'dd')
    expect(dds.map((d) => d.dataset.tone)).toEqual([
      undefined,
      undefined,
      'caution',
      'critical',
      undefined,
    ])
    expect(dds[4]!.textContent).toBe('9 ms')
    expect(q(c, 'ol li').textContent).toContain('r · n')
    button(c, 'Reset counts').click()
    expect(hits).toBe(1)
  })

  test('auto-track follows, a manual scroll pauses, Resume picks it up, the Switch turns it off', async () => {
    const { container: c } = render(() => (
      <>
        <AutoTrack presenter={kofi} section="a" label="Doc">
          <section data-section="a">A</section>
        </AutoTrack>
        <Toaster />
      </>
    ))
    await tick()
    const status = q(c, '[data-scope="auto-track"]')
    expect(status.textContent).toContain('Following Kofi · presenting')
    const region = q(c, '[role="region"]')
    const scrolled = vi.fn()
    region.scrollTo = scrolled as typeof region.scrollTo
    fireEvent.wheel(region)
    await flush()
    expect(status.dataset.state).toBe('paused')
    expect(status.textContent).toContain('Paused: you scrolled')
    button(c, 'Resume').click()
    await flush()
    await tick()
    expect(status.dataset.state).toBe('following')
    expect(scrolled).toHaveBeenCalled()
    q(c, 'input[role="switch"]').click()
    await flush()
    expect(status.textContent).toContain('Off')
  })
})
