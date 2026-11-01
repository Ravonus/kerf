import { IconCheck } from '@weft/icons'
import { announce, arrivalTracker, installSweep, isSheet, uid, type Peer } from '@weft/ui-core'
import { derived, onMount, state, untrack, watch, type State } from 'weft'
import { Button } from '../Button'
import { Drawer } from '../Drawer'
import { PeerAvatar, read, SWEEP, type Live } from './peer'
import '../styles'
import '@weft/ui-core/styles/app/tokens.css'
import '@weft/ui-core/styles/app/base.css'
import '@weft/ui-core/styles/app/comment-thread.css'
import '@weft/ui-core/styles/app/comment-anchor.css'

export interface Comment { id: string; author: Peer; time: string; text: string }
export interface CommentThreadData { id: string; comments: Comment[]; resolved?: boolean }

/**
 * A comment thread (07 §6.2): an article of comments, a reply field and Resolve; resolved collapses to one line with
 * Reopen. A new comment arrives with `data-arrive`; `active` raises it and holds its sweep.
 */
export function CommentThread({ thread, active, onReply, onResolve }: { thread: Live<CommentThreadData>; active?: boolean; onReply?: (text: string) => void; onResolve?: (resolved: boolean) => void }) {
  const id = uid('reply')
  const data = derived(() => read(thread))
  const own = state(untrack(() => !!data.value.resolved))
  const resolved = derived(() => own.value)
  const mark = arrivalTracker()
  const fresh = derived(() => mark(data.value.comments.map(c => c.id)))
  const first = derived(() => data.value.comments[0])
  let root: HTMLElement | undefined
  onMount(() => installSweep())
  const flip = (on: boolean) => {
    own.value = on
    onResolve?.(on)
    if (root) announce(root.ownerDocument, on ? 'Comment resolved' : 'Comment reopened')
  }
  const reply = (e: KeyboardEvent) => {
    const el = e.currentTarget as HTMLInputElement
    if (e.key !== 'Enter' || !el.value.trim()) return
    e.preventDefault()
    onReply?.(el.value.trim())
    el.value = ''
  }
  return (
    <article ref={(n: any) => (root = n)} data-scope="comment-thread" data-c={data.value.id} data-sweep="surface" data-phase="idle" data-active={active ? '' : undefined} data-pin={active ? '' : undefined} data-resolved={resolved.value ? '' : undefined} aria-label={`Comment from ${first.value?.author.name}`}>
      <SWEEP />
      {resolved.value
        ? <div data-part="reply"><span>{first.value?.author.name}: {first.value?.text}</span><Button emphasis="ghost" tone="neutral" size="sm" onClick={() => flip(false)}>Reopen</Button></div>
        : <>
            {data.value.comments.map(c => (
              <div key={c.id} data-part="comment" data-arrive={fresh.value.includes(c.id) ? '' : undefined}>
                <PeerAvatar peer={c.author} size="sm" /><b>{c.author.name}</b><time>{c.time}</time><p>{c.text}</p>
              </div>
            ))}
            <div data-part="reply">
              <label data-part="sr-only" for={id}>Reply to {first.value?.author.name}</label>
              <input id={id} placeholder="Reply…" onKeyDown={reply} />
              <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => flip(true)}><IconCheck /> Resolve</Button>
            </div>
          </>}
    </article>
  )
}

/** The highlighted range a thread hangs from (07 §6.2): activates its thread on press and on focus. */
export function CommentAnchor({ thread, active, children }: { thread: string; active: State<string | null>; children?: any }) {
  const on = () => (active.value = thread)
  return <span data-scope="comment-anchor" data-c={thread} data-active={active.value === thread ? '' : undefined} role="button" tabindex="0" aria-pressed={active.value === thread ? 'true' : 'false'} onClick={on} onFocus={on} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on() } }}>{children}</span>
}

/**
 * The margin rail of anchored threads (07 §6.2): a complementary landmark of articles. On a phone the rail gives way
 * to a bottom Sheet holding the active thread.
 */
export function CommentRail({ threads, active, onReply, onResolve, label = 'Comments' }: { threads: Live<CommentThreadData[]>; active: State<string | null>; onReply?: (thread: string, text: string) => void; onResolve?: (thread: string, resolved: boolean) => void; label?: string }) {
  const list = derived(() => read(threads))
  const phone = state(false)
  let rail: HTMLElement | undefined
  const sheet = state(false)
  onMount(() => {
    queueMicrotask(() => { if (rail && isSheet(rail)) phone.value = true })
    watch(() => active.value, a => { if (phone.value) sheet.value = a !== null })
    watch(() => sheet.value, on => { if (!on) active.value = null })
  })
  const open = derived(() => list.value.find(t => t.id === active.value))
  const body = (t: CommentThreadData) => <CommentThread thread={t} active={active.value === t.id} onReply={x => onReply?.(t.id, x)} onResolve={r => onResolve?.(t.id, r)} />
  return (
    <>
      <aside ref={(n: any) => (rail = n)} aria-label={label} hidden={phone.value}>
        {!phone.value && list.value.map(t => <div key={t.id}>{body(t)}</div>)}
      </aside>
      {phone.value && <Drawer open={sheet} title={label} side="bottom">{open.value ? body(open.value) : null}</Drawer>}
    </>
  )
}
