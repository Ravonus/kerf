import { CheckIcon, UsersIcon } from '@weft-js/warp-icons'
import { isLastOwner, plural } from '@weft-js/warp-core'
import { derived, state, untrack, type State } from '@weft-js/core'
import { Button } from '../Button'
import { Checkbox } from '../Choice'
import { Table } from '../Table'
import { toast } from '../Toast'
import { ConfirmDialog } from './Danger'
import { InviteDialog } from './InviteDialog'
import { PlainTable } from './PlainTable'
import { read } from './atoms'
import { memberColumns, inviteColumns } from './Members/columns'
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
export type Role = {
  value: string
  label: string
  /** Can reach this page; demoting yourself below it warns. */ manages?: boolean
}
/** One member of the team. */
export type Member = {
  id: string
  name: string
  email: string
  role: string
  lastActive?: string | undefined
}
/** An invite still waiting for an answer. */
export type Invite = { id: string; email: string; role: string; sent: string }

/** "7 of 10 seats used" over a rail that fills with the count; pending invites count (09 §4.2). */
export function SeatsMeter({ used, total }: { used: number; total: number }) {
  const left = derived(() => Math.min(100, (used / total) * 100))
  return (
    <div data-scope="meter" data-tone={used >= total ? 'caution' : undefined}>
      <span data-part="note">
        {used} of {total} seats used
      </span>
      <span data-part="rail" data-on="" aria-hidden="true" style={`--v:${left.value}%`}>
        <span data-part="rail-fill"></span>
      </span>
    </div>
  )
}

/** Props for MembersTable. */
export interface MembersTableProps {
  /** Everyone in the workspace, one row each. */
  members: readonly Member[] | State<readonly Member[]>
  /** Pending invitations, listed under the members. */
  invites?: readonly Invite[] | State<readonly Invite[]>
  /** The signed-in member's id. */
  me: string
  roles: Role[]
  owner?: string
  seats: number
  /** Called with the member and the role picked for them. */
  onRoleChange: (member: Member, role: string) => void
  onRemove: (members: Member[]) => Promise<void> | void
  /** Undo for a removal. */
  onRestore?: (members: Member[]) => void
  onInvite: (emails: string[], role: string) => Promise<void> | void
  /** Called with the invite when Resend is pressed. */
  onResend?: (invite: Invite) => void
  onRevoke?: (invite: Invite) => void
}

function removeMembers(
  p: MembersTableProps,
  leaving: State<Member[]>,
  selected: State<Record<string, boolean>>,
) {
  return async () => {
    const gone = leaving.value
    await p.onRemove(gone)
    selected.value = {}
    toast.show({
      title: gone.length > 1 ? `${gone.length} members removed` : `${gone[0]!.name} removed`,
      action: p.onRestore && { label: 'Undo', onClick: () => p.onRestore!(gone) },
    })
  }
}

function askMembers(leaving: State<Member[]>, confirming: State<boolean>) {
  return (list: Member[]) => {
    leaving.value = list
    confirming.value = true
  }
}

function membersState(p: MembersTableProps) {
  const inviting = state(false)
  const confirming = state(false)
  const demoting = state(false)
  const leaving = state<Member[]>([])
  const selected = state<Record<string, boolean>>({})
  let demote: { m: Member; role: string } | undefined
  const people = derived(() => read(p.members))
  const pending = derived(() => read(p.invites ?? []))
  const used = derived(() => people.value.length + pending.value.length)
  const label = (v: string) => p.roles.find((r) => r.value === v)?.label ?? v
  const locked = (m: Member) =>
    isLastOwner(people.value as Member[], m, p.owner === undefined ? 'owner' : p.owner)
  const assign = (m: Member, role: string) => {
    const prev = m.role
    p.onRoleChange(m, role)
    toast.show({
      title: `${m.name} is now ${label(role)}`,
      action: { label: 'Undo', onClick: () => p.onRoleChange({ ...m, role }, prev) },
    })
  }
  const change = (m: Member, role: string) => {
    if (locked(m)) {
      return void toast.show({
        title: m.id === p.me ? 'You’re the only owner' : `${m.name} is the only owner`,
        description: 'Make someone else owner first, then change this role.',
        tone: 'critical',
      })
    }
    if (
      m.id === p.me &&
      p.roles.find((r) => r.value === m.role)?.manages &&
      !p.roles.find((r) => r.value === role)?.manages
    ) {
      demote = { m, role }
      demoting.value = true
      return
    }
    assign(m, role)
  }
  const ask = askMembers(leaving, confirming)
  const remove = removeMembers(p, leaving, selected)
  const removable = (keys: string[]) =>
    people.value.filter((m) => keys.includes(m.id) && m.id !== p.me && !locked(m))
  const count = derived(() => leaving.value.length)
  const columns = memberColumns({ me: () => p.me, roles: () => p.roles, locked, change, ask })
  const invitesColumns = inviteColumns(
    label,
    (v) => p.onResend?.(v),
    (v) => p.onRevoke?.(v),
  )
  const confirmDemote = () => {
    const d = demote!
    assign(d.m, d.role)
  }
  return {
    inviting,
    confirming,
    demoting,
    leaving,
    selected,
    people,
    pending,
    used,
    ask,
    remove,
    removable,
    count,
    columns,
    invitesColumns,
    confirmDemote,
  }
}

function membersView(p: MembersTableProps, ctx: ReturnType<typeof membersState>) {
  return (
    <div data-scope="stack">
      <div data-scope="row" data-justify="between">
        <SeatsMeter used={ctx.used.value} total={p.seats} />
        <Button onClick={() => (ctx.inviting.value = true)}>Invite people</Button>
      </div>
      <Table
        caption="Workspace members"
        captionHidden
        rows={ctx.people}
        columns={ctx.columns}
        picker={false}
        heading={3}
        selection={ctx.selected}
        bulk={(keys) => {
          const list = ctx.removable(keys)
          return (
            <Button
              emphasis="soft"
              tone="critical"
              size="sm"
              disabled={!list.length}
              onClick={() => ctx.ask(list)}
            >
              {list.length ? `Remove ${plural(list.length, 'member')}` : 'Can’t remove these'}
            </Button>
          )
        }}
      />
      {ctx.pending.value.length > 0 && (
        <Table
          caption="Pending invites"
          rows={ctx.pending}
          columns={ctx.invitesColumns}
          picker={false}
          heading={3}
        />
      )}
      <InviteDialog
        open={ctx.inviting}
        roles={p.roles.filter((r) => r.value !== (p.owner === undefined ? 'owner' : p.owner))}
        seatsLeft={p.seats - ctx.used.value}
        onSend={p.onInvite}
        defaultRole="member"
      />
      <ConfirmDialog
        open={ctx.confirming}
        glyph={UsersIcon}
        tone="critical"
        title={
          ctx.count.value > 1
            ? `Remove ${ctx.count.value} members?`
            : `Remove ${ctx.leaving.value[0]?.name}?`
        }
        description={`${ctx.leaving.value.map((m) => m.name).join(', ')} ${ctx.count.value > 1 ? 'lose' : 'loses'} access right away. Their work stays.`}
        action={ctx.count.value > 1 ? `Remove ${ctx.count.value} members` : 'Remove member'}
        onConfirm={ctx.remove}
      />
      <ConfirmDialog
        open={ctx.demoting}
        tone="critical"
        title="Change your own role?"
        description="You’ll lose access to this page, and someone else will have to give it back."
        action="Change my role"
        onConfirm={ctx.confirmDemote}
      />
    </div>
  )
}

/**
 * Members (09 §4.2): DataTable with an inline role select, a bulk bar, and pending invites below. Role changes apply at
 * once with Undo; removals ask, with one Undo for the batch. The last owner can't be demoted or removed, and the
 * select says why; demoting yourself warns first.
 */
export function MembersTable(props: MembersTableProps) {
  const p = untrack(() => props)
  return membersView(p, membersState(p))
}

/** One row of the permissions matrix, with the roles that have it. */
export type Permission = { id: string; label: string; roles: string[] }

/** What each role can do (09 §4.2): rows are permissions, columns are roles. Read-only unless `onToggle` is given. */
export function RolesMatrix({
  roles,
  permissions,
  onToggle,
}: {
  roles: Role[]
  permissions: Permission[]
  onToggle?: (permission: Permission, role: string, on: boolean) => void
}) {
  return (
    <PlainTable
      label="Roles matrix"
      scope="roles-matrix"
      caption="Permissions by role"
      head={
        <tr>
          <th scope="col">Permission</th>
          {roles.map((r) => (
            <th key={r.value} scope="col">
              {r.label}
            </th>
          ))}
        </tr>
      }
    >
      {permissions.map((p) => (
        <tr key={p.id}>
          <th scope="row">{p.label}</th>
          {roles.map((r) => (
            <td key={r.value}>
              {onToggle ? (
                <Checkbox
                  checked={p.roles.includes(r.value)}
                  aria-label={`${r.label}: ${p.label}`}
                  onChange={(e: Event) =>
                    onToggle(p, r.value, (e.currentTarget as HTMLInputElement).checked)
                  }
                />
              ) : p.roles.includes(r.value) ? (
                <span data-part="yes">
                  <CheckIcon />
                  <span data-part="sr-only">Yes</span>
                </span>
              ) : (
                <>
                  <span data-part="no" aria-hidden="true">
                    –
                  </span>
                  <span data-part="sr-only">No</span>
                </>
              )}
            </td>
          ))}
        </tr>
      ))}
    </PlainTable>
  )
}
