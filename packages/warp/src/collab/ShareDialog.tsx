import { CopyIcon, LinkIcon } from '@weft/icons'
import { announce, arrivalTracker, installSweep, uid, type Peer } from '@weft/ui-core'
import { derived, state, untrack, type State } from 'weft'
import { Button } from '../Button'
import { ComboField } from '../Combobox'
import { Modal } from '../Modal'
import { Tag } from '../Tag'
import { PeerAvatar, read, type Live } from './peer'
import '../styles'
import '@weft/ui-core/styles/app/tokens.css'
import '@weft/ui-core/styles/app/base.css'
import '@weft/ui-core/styles/app/share.css'
import '@weft/ui-core/styles/components/share.css'


export type ShareRole = 'viewer' | 'commenter' | 'editor' | 'owner'
const ROLES: [ShareRole, string][] = [['viewer', 'Viewer'], ['commenter', 'Commenter'], ['editor', 'Editor']]
export type ShareMember = Peer & { email: string; role: ShareRole }
export type ShareContact = Peer & { email: string }
export interface ShareLink { access: 'restricted' | 'anyone'; role: ShareRole }

export interface ShareDialogProps {
  open: State<boolean>
  /** The object's title: "Q4 brief". */
  title: string
  members: Live<ShareMember[]>
  /** People the invite field suggests; any email address works too. */
  people?: ShareContact[]
  link: Live<ShareLink>
  /** The URL Copy link writes. */
  url: string
  onInvite: (emails: string[], role: ShareRole) => void
  /** A role, or null to remove the person. */
  onRoleChange: (m: ShareMember, role: ShareRole | null) => void
  onLinkAccess: (link: ShareLink) => void
}

const roleOptions = () => ROLES.map(([v, l]) => ({ v, l }))

/**
 * The share dialog (07 §6.2): the invite combobox with chips, a role per person, link access, Copy link with one
 * confirm sweep, and invited rows arriving.
 */
export function ShareDialog({ open, title, members, people, link, url, onInvite, onRoleChange, onLinkAccess }: ShareDialogProps) {
  const id = uid('share')
  const list = derived(() => read(members))
  const access = derived(() => read(link))
  const mark = arrivalTracker()
  const fresh = derived(() => mark(list.value.map(m => m.id)))
  const typed = state('')
  const chips = state<string[]>([])
  const role = state<ShareRole>('editor')
  const copied = state(false)
  let copy: HTMLElement | undefined
  const add = (email: string) => {
    const e = email.trim()
    if (e && !chips.value.includes(e)) chips.value = [...chips.value, e]
    typed.value = ''
  }
  const find = async (q: string) => untrack(() => (people ?? []).filter(p => `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase())))
  const invite = () => {
    const all = typed.value.includes('@') ? [...new Set([...chips.value, typed.value.trim()])] : chips.value
    if (!all.length) return
    onInvite(all, role.value)
    announce(copy!.ownerDocument, `Invited ${all.length === 1 ? all[0] : `${all.length} people`}`)
    chips.value = []
    typed.value = ''
  }
  return (
    <Modal open={open} title={`Share “${title}”`} footer={<Button onClick={() => (open.value = false)}>Done</Button>}>
      <div data-scope="share">
        <form style="display:flex;gap:8px;align-items:center" onSubmit={(e: Event) => { e.preventDefault(); if (typed.value.includes('@')) add(typed.value); else invite() }}>
          <div style="flex:1;min-inline-size:0">
            <ComboField label="Add people or email" minChars={1} text={() => typed.value} onText={t => (typed.value = t)} find={find} row={(p: ShareContact) => ({ main: p.name, sub: p.email })} onPick={(p: ShareContact) => add(p.email)} />
          </div>
          <label data-part="sr-only" for={`${id}-r`}>Role for new people</label>
          <select id={`${id}-r`} value={role.value} onChange={(e: any) => (role.value = e.currentTarget.value)}>
            {roleOptions().map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <Button onClick={invite}>Invite</Button>
        </form>
        {chips.value.length > 0 && <div style="display:flex;flex-wrap:wrap;gap:6px;margin-block-start:8px">{chips.value.map(c => <Tag key={c} onRemove={() => (chips.value = chips.value.filter(x => x !== c))}>{c}</Tag>)}</div>}
        <div>
          {list.value.map(m => (
            <div key={m.id} data-part="person" data-arrive={fresh.value.includes(m.id) ? '' : undefined}>
              <PeerAvatar peer={m} size="sm" />
              <span>{m.name}<small>{m.email}</small></span>
              {m.role === 'owner'
                ? <span>Owner</span>
                : <>
                    <label data-part="sr-only" for={`${id}-${m.id}`}>Role for {m.name}</label>
                    <select id={`${id}-${m.id}`} value={m.role} onChange={(e: any) => { const v = e.currentTarget.value; onRoleChange(m, v === 'remove' ? null : v) }}>
                      {roleOptions().map(o => <option key={o.v} value={o.v} selected={o.v === m.role}>{o.l}</option>)}
                      <option value="remove">Remove</option>
                    </select>
                  </>}
            </div>
          ))}
        </div>
        <div data-part="link">
          <LinkIcon />
          <label data-part="sr-only" for={`${id}-a`}>Link access</label>
          <select id={`${id}-a`} value={access.value.access} onChange={(e: any) => onLinkAccess({ ...access.value, access: e.currentTarget.value })}>
            <option value="restricted" selected={access.value.access === 'restricted'}>Restricted</option>
            <option value="anyone" selected={access.value.access === 'anyone'}>Anyone with link</option>
          </select>
          {access.value.access === 'anyone' && <>
            <label data-part="sr-only" for={`${id}-l`}>Link role</label>
            <select id={`${id}-l`} value={access.value.role} onChange={(e: any) => onLinkAccess({ ...access.value, role: e.currentTarget.value })}>
              {roleOptions().map(o => <option key={o.v} value={o.v} selected={o.v === access.value.role}>{o.l}</option>)}
            </select>
          </>}
          <span data-part="spacer" style="flex:1"></span>
          <span ref={(n: any) => (copy = n)} style="display:contents">
            <Button emphasis="outline" tone="neutral" size="sm" onClick={(e: MouseEvent) => {
              void navigator.clipboard?.writeText(url).catch(() => {})
              copied.value = true
              installSweep().confirm(e.currentTarget as Element)
              announce((e.currentTarget as Element).ownerDocument, 'Link copied')
            }}><CopyIcon /> {copied.value ? 'Copied' : 'Copy link'}</Button>
          </span>
        </div>
      </div>
    </Modal>
  )
}
