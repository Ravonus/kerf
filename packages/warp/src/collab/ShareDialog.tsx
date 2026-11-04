import { CopyIcon, LinkIcon } from '@weft-js/warp-icons'
import { announce, arrivalTracker, installSweep, type Peer } from '@weft-js/warp-core'
import { derived, state, untrack, type State } from '@weft-js/core'
import { Button } from '../Button'
import { ComboField } from '../Combobox'
import { Modal } from '../Modal'
import { CompactSelect } from '../Select'
import { Tag } from '../Tag'
import { PeerAvatar, read, type Live } from './peer'
import '../styles'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/share.css'
import '@weft-js/warp-core/styles/components/share.css'

/** What someone may do with the document. */
export type ShareRole = 'viewer' | 'commenter' | 'editor' | 'owner'
const ROLES: [ShareRole, string][] = [
  ['viewer', 'Viewer'],
  ['commenter', 'Commenter'],
  ['editor', 'Editor'],
]
/** Someone the document is shared with. */
export type ShareMember = Peer & { email: string; role: ShareRole }
/** Someone it could be shared with. */
export type ShareContact = Peer & { email: string }
/** Who a link lets in, and as what. */
export interface ShareLink {
  access: 'restricted' | 'anyone'
  role: ShareRole
}

/** Props for ShareDialog. */
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

const ROLE_OPTIONS = ROLES.map(([value, label]) => ({ value, label }))
const MEMBER_OPTIONS = [...ROLE_OPTIONS, { value: 'remove', label: 'Remove' }]
const ACCESS_OPTIONS = [
  { value: 'restricted', label: 'Restricted' },
  { value: 'anyone', label: 'Anyone with link' },
]

/**
 * The share dialog (07 §6.2): the invite combobox with chips, a role per person, link access, Copy link with one
 * confirm sweep, and invited rows arriving.
 */
export function ShareDialog({
  open,
  title,
  members,
  people,
  link,
  url,
  onInvite,
  onRoleChange,
  onLinkAccess,
}: ShareDialogProps) {
  const list = derived(() => read(members))
  const access = derived(() => read(link))
  const mark = arrivalTracker()
  const fresh = derived(() => mark(list.value.map((m) => m.id)))
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
  // oxlint-disable-next-line typescript/require-await -- `find` is typed to return a promise, and Promise.resolve costs bytes for nothing
  const find = async (q: string) =>
    untrack(() =>
      (people ?? []).filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase())),
    )
  const invite = () => {
    const all = typed.value.includes('@')
      ? [...new Set([...chips.value, typed.value.trim()])]
      : chips.value
    if (!all.length) return
    onInvite(all, role.value)
    announce(copy!.ownerDocument, `Invited ${all.length === 1 ? all[0] : `${all.length} people`}`)
    chips.value = []
    typed.value = ''
  }
  return (
    <Modal
      open={open}
      title={`Share “${title}”`}
      footer={<Button onClick={() => (open.value = false)}>Done</Button>}
    >
      <div data-scope="share">
        <form
          style="display:flex;gap:8px;align-items:center"
          onSubmit={(e: Event) => {
            e.preventDefault()
            if (typed.value.includes('@')) add(typed.value)
            else invite()
          }}
        >
          <div style="flex:1;min-inline-size:0">
            <ComboField
              label="Add people or email"
              minChars={1}
              text={() => typed.value}
              onText={(t) => (typed.value = t)}
              find={find}
              row={(p: ShareContact) => ({ main: p.name, sub: p.email })}
              onPick={(p: ShareContact) => add(p.email)}
            />
          </div>
          <CompactSelect
            label="Role for new people"
            value={role.value}
            options={ROLE_OPTIONS}
            onValueChange={(v) => (role.value = v as ShareRole)}
          />
          <Button onClick={invite}>Invite</Button>
        </form>
        {chips.value.length > 0 && (
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-block-start:8px">
            {chips.value.map((c) => (
              <Tag key={c} onRemove={() => (chips.value = chips.value.filter((x) => x !== c))}>
                {c}
              </Tag>
            ))}
          </div>
        )}
        <div>
          {list.value.map((m) => (
            <div
              key={m.id}
              data-part="person"
              data-arrive={fresh.value.includes(m.id) ? '' : undefined}
            >
              <PeerAvatar peer={m} size="sm" />
              <span>
                {m.name}
                <small>{m.email}</small>
              </span>
              {m.role === 'owner' ? (
                <span>Owner</span>
              ) : (
                <>
                  <CompactSelect
                    label={`Role for ${m.name}`}
                    value={m.role}
                    options={MEMBER_OPTIONS}
                    onValueChange={(v) => onRoleChange(m, v === 'remove' ? null : (v as ShareRole))}
                  />
                </>
              )}
            </div>
          ))}
        </div>
        <div data-part="link">
          <LinkIcon />
          <CompactSelect
            label="Link access"
            value={access.value.access}
            options={ACCESS_OPTIONS}
            onValueChange={(v) =>
              onLinkAccess({ ...access.value, access: v as ShareLink['access'] })
            }
          />
          {access.value.access === 'anyone' && (
            <CompactSelect
              label="Link role"
              value={access.value.role}
              options={ROLE_OPTIONS}
              onValueChange={(v) => onLinkAccess({ ...access.value, role: v as ShareRole })}
            />
          )}
          <span data-part="spacer" style="flex:1"></span>
          <span ref={(n) => (copy = n)} style="display:contents">
            <Button
              emphasis="outline"
              tone="neutral"
              size="sm"
              onClick={(e: MouseEvent) => {
                void navigator.clipboard?.writeText(url).catch(() => {})
                copied.value = true
                installSweep().confirm(e.currentTarget as Element)
                announce((e.currentTarget as Element).ownerDocument, 'Link copied')
              }}
            >
              <CopyIcon /> {copied.value ? 'Copied' : 'Copy link'}
            </Button>
          </span>
        </div>
      </div>
    </Modal>
  )
}
