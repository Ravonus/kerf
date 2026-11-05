import { state } from '@weft-js/core'
import { MembersTable, Toaster } from '@weft-js/warp'
import type { Invite, Member } from '@weft-js/warp'
import { TEAM_INVITES, TEAM_MEMBERS, TEAM_ROLES } from '../../world'

// -- members --

export function MembersTableTeam() {
  const people = state<readonly Member[]>(TEAM_MEMBERS)
  const invites = state<readonly Invite[]>(TEAM_INVITES)
  return (
    <>
      <MembersTable
        members={people}
        invites={invites}
        me="mara"
        roles={TEAM_ROLES}
        seats={12}
        onRoleChange={(m, role) =>
          (people.value = people.value.map((x) => (x.id === m.id ? { ...x, role } : x)))
        }
        onRemove={(gone) => {
          people.value = people.value.filter((x) => !gone.includes(x))
        }}
        onRestore={(back) => (people.value = [...people.value, ...back])}
        onInvite={(emails, role) => {
          invites.value = [
            ...invites.value,
            ...emails.map((email) => ({ id: email, email, role, sent: 'Just now' })),
          ]
        }}
        onRevoke={(invite) => (invites.value = invites.value.filter((x) => x !== invite))}
      />
      <Toaster />
    </>
  )
}
