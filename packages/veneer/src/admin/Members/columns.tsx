import { TrashIcon } from '@kerf/veneer-icons'
import { uid } from '@kerf/veneer-core'
import { derived } from '@kerf/core'
import { Badge } from '../../Badge'
import { Button } from '../../Button'
import { Avatar } from '../../parts'
import type { Column } from '../../Table'
import { toast } from '../../Toast'
import { InlineSelect } from '../atoms'
import type { Member, Invite, Role } from '../Members'

function nameCell(m: Member, me: () => string) {
  return (
    <span data-scope="row" data-wrap="none">
      <Avatar name={m.name} size="sm" />
      <span>
        <b>{m.name}</b>
        {m.id === me() && (
          <>
            {' '}
            <Badge>You</Badge>
          </>
        )}
        <br />
        <span class="muted">{m.email}</span>
      </span>
    </span>
  )
}

export function memberColumns({
  me,
  roles,
  locked,
  change,
  ask,
}: {
  me: () => string
  roles: () => Role[]
  locked: (m: Member) => boolean
  change: (m: Member, role: string) => void
  ask: (list: Member[]) => void
}): Column<Member>[] {
  const inputs = {
    get roles() {
      return roles()
    },
  }
  return [
    {
      id: 'name',
      header: 'Name',
      rowHeader: true,
      card: 'title',
      sort: true,
      cell: (m) => nameCell(m, me),
    },
    {
      id: 'role',
      header: 'Role',
      cell: (m) => {
        const held = derived(() => locked(m))
        return (
          <RoleCell
            member={m}
            label={`Role for ${m.name}`}
            roles={inputs.roles}
            locked={held.value}
            onChange={(r) => change(m, r)}
          />
        )
      },
    },
    { id: 'lastActive', header: 'Last active', card: 'hide' },
    {
      id: 'menu',
      header: 'Actions',
      value: () => '',
      cell: (m) =>
        m.id === me() || locked(m) ? (
          ''
        ) : (
          <Button
            emphasis="ghost"
            tone="critical"
            size="sm"
            data-icon-only=""
            label={`Remove ${m.name}`}
            onClick={() => ask([m])}
          >
            <TrashIcon />
          </Button>
        ),
    },
  ]
}

export function inviteColumns(
  label: (v: string) => string,
  onResend: (v: Invite) => void,
  onRevoke: (v: Invite) => void,
): Column<Invite>[] {
  return [
    {
      id: 'email',
      header: 'Email',
      rowHeader: true,
      card: 'title',
      cell: (v) => (
        <span data-scope="row" data-wrap="none">
          <Avatar name={v.email} size="sm" />
          <span>
            <b>{v.email}</b>
            <br />
            <span class="muted">Invite pending, sent {v.sent}</span>
          </span>
        </span>
      ),
    },
    { id: 'role', header: 'Role', cell: (v) => <Badge>{label(v.role)}</Badge> },
    {
      id: 'actions',
      header: 'Actions',
      value: () => '',
      cell: (v) => (
        <span data-scope="row">
          <Button
            emphasis="link"
            aria-label={`Resend invite to ${v.email}`}
            onClick={() => {
              onResend?.(v)
              toast.show({ title: `Invite resent to ${v.email}`, tone: 'positive' })
            }}
          >
            Resend
          </Button>
          <Button
            emphasis="link"
            tone="critical"
            aria-label={`Revoke invite to ${v.email}`}
            onClick={() => onRevoke?.(v)}
          >
            Revoke
          </Button>
        </span>
      ),
    },
  ]
}

function RoleCell({
  member,
  label,
  roles,
  locked,
  onChange,
}: {
  member: Member
  label: string
  roles: Role[]
  locked: boolean
  onChange: (role: string) => void
}) {
  const id = uid('role')
  return (
    <>
      <InlineSelect
        label={label}
        value={member.role}
        options={roles}
        describedby={locked ? `${id}-why` : undefined}
        onValueChange={onChange}
      />
      {locked && (
        <span data-part="sr-only" id={`${id}-why`}>
          This is the only owner. Make someone else owner first.
        </span>
      )}
    </>
  )
}
