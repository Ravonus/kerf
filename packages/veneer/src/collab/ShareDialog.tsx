import { CopyIcon, LinkIcon } from '@kerf/veneer-icons'
import { announce, arrivalTracker, installSweep, type Peer } from '@kerf/veneer-core'
import { derived, state, untrack, type State } from '@kerf/core'
import { Button } from '../Button'
import { ComboField } from '../Combobox'
import { Modal } from '../Modal'
import { CompactSelect } from '../Select'
import { Tag } from '../Tag'
import { PeerAvatar, read, type Live } from './peer'
import '../styles'
import '@kerf/veneer-core/styles/app/tokens.css'
import '@kerf/veneer-core/styles/app/base.css'
import '@kerf/veneer-core/styles/app/share.css'
import '@kerf/veneer-core/styles/components/share.css'

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

type ShareViewContext = {
  readonly open: State<boolean>
  readonly title: string
  list: { readonly value: ShareMember[] }
  access: { readonly value: ShareLink }
  fresh: { readonly value: string[] }
  typed: State<string>
  chips: State<string[]>
  role: State<ShareRole>
  copied: State<boolean>
  add: (email: string) => void
  find: (q: string) => Promise<ShareContact[]>
  invite: () => void
  submit: (e: Event) => void
  copyLink: (e: MouseEvent) => void
  setCopy: (n: HTMLElement) => void
  onRoleChange: ShareDialogProps['onRoleChange']
  onLinkAccess: ShareDialogProps['onLinkAccess']
}

function memberRole(ctx: ShareViewContext, m: ShareMember) {
  return m.role === 'owner' ? (
    <span>Owner</span>
  ) : (
    <>
      <CompactSelect
        label={`Role for ${m.name}`}
        value={m.role}
        options={MEMBER_OPTIONS}
        onValueChange={(v) => ctx.onRoleChange(m, v === 'remove' ? null : (v as ShareRole))}
      />
    </>
  )
}

function shareChips(ctx: ShareViewContext) {
  return (
    ctx.chips.value.length > 0 && (
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-block-start:8px">
        {ctx.chips.value.map((c) => (
          <Tag key={c} onRemove={() => (ctx.chips.value = ctx.chips.value.filter((x) => x !== c))}>
            {c}
          </Tag>
        ))}
      </div>
    )
  )
}

function shareLinkRole(ctx: ShareViewContext) {
  return (
    ctx.access.value.access === 'anyone' && (
      <CompactSelect
        label="Link role"
        value={ctx.access.value.role}
        options={ROLE_OPTIONS}
        onValueChange={(v) => ctx.onLinkAccess({ ...ctx.access.value, role: v as ShareRole })}
      />
    )
  )
}

function shareView(ctx: ShareViewContext) {
  return (
    <Modal
      open={ctx.open}
      title={`Share “${ctx.title}”`}
      footer={<Button onClick={() => (ctx.open.value = false)}>Done</Button>}
    >
      <div data-scope="share">
        <form
          style="display:flex;gap:8px;align-items:center"
          onSubmit={(e: Event) => ctx.submit(e)}
        >
          <div style="flex:1;min-inline-size:0">
            <ComboField
              label="Add people or email"
              minChars={1}
              text={() => ctx.typed.value}
              onText={(t) => (ctx.typed.value = t)}
              find={ctx.find}
              row={(p: ShareContact) => ({ main: p.name, sub: p.email })}
              onPick={(p: ShareContact) => ctx.add(p.email)}
            />
          </div>
          <CompactSelect
            label="Role for new people"
            value={ctx.role.value}
            options={ROLE_OPTIONS}
            onValueChange={(v) => (ctx.role.value = v as ShareRole)}
          />
          <Button onClick={ctx.invite}>Invite</Button>
        </form>
        {shareChips(ctx)}
        <div>
          {ctx.list.value.map((m) => (
            <div
              key={m.id}
              data-part="person"
              data-arrive={ctx.fresh.value.includes(m.id) ? '' : undefined}
            >
              <PeerAvatar peer={m} size="sm" />
              <span>
                {m.name}
                <small>{m.email}</small>
              </span>
              {memberRole(ctx, m)}
            </div>
          ))}
        </div>
        <div data-part="link">
          <LinkIcon />
          <CompactSelect
            label="Link access"
            value={ctx.access.value.access}
            options={ACCESS_OPTIONS}
            onValueChange={(v) =>
              ctx.onLinkAccess({ ...ctx.access.value, access: v as ShareLink['access'] })
            }
          />
          {shareLinkRole(ctx)}
          <span data-part="spacer" style="flex:1"></span>
          <span ref={(n) => ctx.setCopy(n)} style="display:contents">
            <Button
              emphasis="outline"
              tone="neutral"
              size="sm"
              onClick={(e: MouseEvent) => ctx.copyLink(e)}
            >
              <CopyIcon /> {ctx.copied.value ? 'Copied' : 'Copy link'}
            </Button>
          </span>
        </div>
      </div>
    </Modal>
  )
}

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
  const submit = (e: Event) => {
    e.preventDefault()
    if (typed.value.includes('@')) add(typed.value)
    else invite()
  }
  const copyLink = (e: MouseEvent) => {
    void navigator.clipboard?.writeText(url).catch(() => {})
    copied.value = true
    installSweep().confirm(e.currentTarget as Element)
    announce((e.currentTarget as Element).ownerDocument, 'Link copied')
  }
  return shareView({
    get open() {
      return open
    },
    get title() {
      return title
    },
    list,
    access,
    fresh,
    typed,
    chips,
    role,
    copied,
    add,
    find,
    invite,
    submit,
    copyLink,
    setCopy: (n) => (copy = n),
    onRoleChange: (m, value) => onRoleChange(m, value),
    onLinkAccess: (value) => onLinkAccess(value),
  })
}
