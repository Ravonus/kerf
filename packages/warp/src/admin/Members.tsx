import { CheckIcon, TrashIcon, UsersIcon } from '@weft-js/warp-icons'
import { isLastOwner, plural, uid } from '@weft-js/warp-core'
import { derived, state, type State } from '@weft-js/core'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Checkbox } from '../Choice'
import { Avatar } from '../parts'
import { Table, type Column } from '../Table'
import { toast } from '../Toast'
import { ConfirmDialog } from './Danger'
import { InviteDialog } from './InviteDialog'
import { PlainTable } from './PlainTable'
import { InlineSelect, read } from './atoms'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/flows/meter.css'
import '@weft-js/warp-core/styles/flows/roles-matrix.css'

/** A role a member can hold. */
export type Role = { value: string; label: string; /** Can reach this page; demoting yourself below it warns. */ manages?: boolean }
/** One member of the team. */
export type Member = { id: string; name: string; email: string; role: string; lastActive?: string }
/** An invite still waiting for an answer. */
export type Invite = { id: string; email: string; role: string; sent: string }

/** "7 of 10 seats used" over a rail that fills with the count; pending invites count (09 §4.2). */
export function SeatsMeter({ used, total }: { used: number; total: number }) {
  const left = derived(() => Math.min(100, (used / total) * 100))
  return (
    <div data-scope="meter" data-tone={used >= total ? 'caution' : undefined}>
      <span data-part="note">{used} of {total} seats used</span>
      <span data-part="rail" data-on="" aria-hidden="true" style={`--v:${left.value}%`}><span data-part="rail-fill"></span></span>
    </div>
  )
}

/** Props for MembersTable. */
export interface MembersTableProps {
  members: readonly Member[] | State<readonly Member[]>
  invites?: readonly Invite[] | State<readonly Invite[]>
  /** The signed-in member's id. */
  me: string
  roles: Role[]
  owner?: string
  seats: number
  onRoleChange: (member: Member, role: string) => void
  onRemove: (members: Member[]) => Promise<void> | void
  /** Undo for a removal. */
  onRestore?: (members: Member[]) => void
  onInvite: (emails: string[], role: string) => Promise<void> | void
  onResend?: (invite: Invite) => void
  onRevoke?: (invite: Invite) => void
}

/**
 * Members (09 §4.2): DataTable with an inline role select, a bulk bar, and pending invites below. Role changes apply at
 * once with Undo; removals ask, with one Undo for the batch. The last owner can't be demoted or removed, and the
 * select says why; demoting yourself warns first.
 */
export function MembersTable({ members, invites, me, roles, owner = 'owner', seats, onRoleChange, onRemove, onRestore, onInvite, onResend, onRevoke }: MembersTableProps) {
  const inviting = state(false)
  const confirming = state(false)
  const demoting = state(false)
  const leaving = state<Member[]>([])
  const selected = state<Record<string, boolean>>({})
  let demote: { m: Member; role: string } | undefined
  const people = derived(() => read(members) as readonly Member[])
  const pending = derived(() => (read(invites ?? []) as readonly Invite[]))
  const used = derived(() => people.value.length + pending.value.length)
  const label = (v: string) => roles.find(r => r.value === v)?.label ?? v
  const locked = (m: Member) => isLastOwner(people.value as Member[], m, owner)
  const assign = (m: Member, role: string) => {
    const prev = m.role
    onRoleChange(m, role)
    toast.show({ title: `${m.name} is now ${label(role)}`, action: { label: 'Undo', onClick: () => onRoleChange({ ...m, role }, prev) } })
  }
  const change = (m: Member, role: string) => {
    if (locked(m)) {
      return void toast.show({ title: m.id === me ? 'You’re the only owner' : `${m.name} is the only owner`, description: 'Make someone else owner first, then change this role.', tone: 'critical' })
    }
    if (m.id === me && roles.find(r => r.value === m.role)?.manages && !roles.find(r => r.value === role)?.manages) {
      demote = { m, role }
      demoting.value = true
      return
    }
    assign(m, role)
  }
  const ask = (list: Member[]) => { leaving.value = list; confirming.value = true }
  const remove = async () => {
    const gone = leaving.value
    await onRemove(gone)
    selected.value = {}
    toast.show({ title: gone.length > 1 ? `${gone.length} members removed` : `${gone[0]!.name} removed`, action: onRestore && { label: 'Undo', onClick: () => onRestore(gone) } })
  }
  const removable = (keys: string[]) => people.value.filter(m => keys.includes(m.id) && m.id !== me && !locked(m))
  const count = derived(() => leaving.value.length)
  const columns: Column<Member>[] = [
    {
      id: 'name', header: 'Name', rowHeader: true, card: 'title', sort: true,
      cell: m => <span data-scope="row" data-wrap="none"><Avatar name={m.name} size="sm" /><span><b>{m.name}</b>{m.id === me && <>{' '}<Badge>You</Badge></>}<br /><span class="muted">{m.email}</span></span></span>,
    },
    { id: 'role', header: 'Role', cell: m => { const held = derived(() => locked(m)); return <RoleCell member={m} label={`Role for ${m.name}`} roles={roles} locked={held.value} onChange={r => change(m, r)} /> } },
    { id: 'lastActive', header: 'Last active', card: 'hide' },
    {
      id: 'menu', header: 'Actions', value: () => '',
      cell: m => (m.id === me || locked(m) ? '' : <Button emphasis="ghost" tone="critical" size="sm" data-icon-only="" label={`Remove ${m.name}`} onClick={() => ask([m])}><TrashIcon /></Button>),
    },
  ]
  const inviteColumns: Column<Invite>[] = [
    { id: 'email', header: 'Email', rowHeader: true, card: 'title', cell: v => <span data-scope="row" data-wrap="none"><Avatar name={v.email} size="sm" /><span><b>{v.email}</b><br /><span class="muted">Invite pending, sent {v.sent}</span></span></span> },
    { id: 'role', header: 'Role', cell: v => <Badge>{label(v.role)}</Badge> },
    {
      id: 'actions', header: 'Actions', value: () => '',
      cell: v => <span data-scope="row"><Button emphasis="link" aria-label={`Resend invite to ${v.email}`} onClick={() => { onResend?.(v); toast.show({ title: `Invite resent to ${v.email}`, tone: 'positive' }) }}>Resend</Button><Button emphasis="link" tone="critical" aria-label={`Revoke invite to ${v.email}`} onClick={() => onRevoke?.(v)}>Revoke</Button></span>,
    },
  ]
  return (
    <div data-scope="stack">
      <div data-scope="row" data-justify="between">
        <SeatsMeter used={used.value} total={seats} />
        <Button onClick={() => (inviting.value = true)}>Invite people</Button>
      </div>
      <Table
        caption="Workspace members"
        captionHidden
        rows={people}
        columns={columns}
        picker={false}
        heading={3}
        selection={selected}
        bulk={keys => {
          const list = removable(keys)
          return <Button emphasis="soft" tone="critical" size="sm" disabled={!list.length} onClick={() => ask(list)}>{list.length ? `Remove ${plural(list.length, 'member')}` : 'Can’t remove these'}</Button>
        }}
      />
      {pending.value.length > 0 && <Table caption="Pending invites" rows={pending} columns={inviteColumns} picker={false} heading={3} />}
      <InviteDialog open={inviting} roles={roles.filter(r => r.value !== owner)} seatsLeft={seats - used.value} onSend={onInvite} defaultRole="member" />
      <ConfirmDialog open={confirming} glyph={UsersIcon} tone="critical" title={count.value > 1 ? `Remove ${count.value} members?` : `Remove ${leaving.value[0]?.name}?`} description={`${leaving.value.map(m => m.name).join(', ')} ${count.value > 1 ? 'lose' : 'loses'} access right away. Their work stays.`} action={count.value > 1 ? `Remove ${count.value} members` : 'Remove member'} onConfirm={remove} />
      <ConfirmDialog open={demoting} tone="critical" title="Change your own role?" description="You’ll lose access to this page, and someone else will have to give it back." action="Change my role" onConfirm={() => { const d = demote!; assign(d.m, d.role) }} />
    </div>
  )
}

function RoleCell({ member, label, roles, locked, onChange }: { member: Member; label: string; roles: Role[]; locked: boolean; onChange: (role: string) => void }) {
  const id = uid('role')
  return (
    <>
      <InlineSelect label={label} value={member.role} options={roles} describedby={locked ? `${id}-why` : undefined} onValueChange={onChange} />
      {locked && <span data-part="sr-only" id={`${id}-why`}>This is the only owner. Make someone else owner first.</span>}
    </>
  )
}

/** One row of the permissions matrix, with the roles that have it. */
export type Permission = { id: string; label: string; roles: string[] }

/** What each role can do (09 §4.2): rows are permissions, columns are roles. Read-only unless `onToggle` is given. */
export function RolesMatrix({ roles, permissions, onToggle }: { roles: Role[]; permissions: Permission[]; onToggle?: (permission: Permission, role: string, on: boolean) => void }) {
  return (
    <PlainTable label="Roles matrix" scope="roles-matrix" caption="Permissions by role" head={<tr><th scope="col">Permission</th>{roles.map(r => <th key={r.value} scope="col">{r.label}</th>)}</tr>}>
      {permissions.map(p => (
        <tr key={p.id}>
          <th scope="row">{p.label}</th>
          {roles.map(r => (
            <td key={r.value}>
              {onToggle
                ? <Checkbox checked={p.roles.includes(r.value)} aria-label={`${r.label}: ${p.label}`} onChange={(e: Event) => onToggle(p, r.value, (e.currentTarget as HTMLInputElement).checked)} />
                : p.roles.includes(r.value)
                  ? <span data-part="yes"><CheckIcon /><span data-part="sr-only">Yes</span></span>
                  : <><span data-part="no" aria-hidden="true">–</span><span data-part="sr-only">No</span></>}
            </td>
          ))}
        </tr>
      ))}
    </PlainTable>
  )
}
