import { state } from '@kerf/core'
import { MembersTable, Toaster } from '@kerf/veneer'
import type { Invite, Member } from '@kerf/veneer'
import {
  TEAM_INVITES,
  TEAM_MEMBERS,
  TEAM_ROLES,
} from '../../world'

// -- members --

export function MembersTableTeam() {
  const people = state<readonly Member[]>(TEAM_MEMBERS)
  const invites = state<readonly Invite[]>(TEAM_INVITES)
  const remove = (gone: Member[]) => {
    people.value = people.value.filter(
      (person) => !gone.includes(person),
    )
  }
  const inviteMembers = (
    emails: string[],
    role: string,
  ) => {
    invites.value = [
      ...invites.value,
      ...emails.map((email) => ({
        id: email,
        email,
        role,
        sent: 'Just now',
      })),
    ]
  }
  return (
    <>
      <MembersTable
        members={people}
        invites={invites}
        me="mara"
        roles={TEAM_ROLES}
        seats={12}
        onRoleChange={(m, role) =>
          (people.value = people.value.map((x) =>
            x.id === m.id ? { ...x, role } : x,
          ))
        }
        onRemove={remove}
        onRestore={(back) =>
          (people.value = [...people.value, ...back])
        }
        onInvite={inviteMembers}
        onRevoke={(invite) =>
          (invites.value = invites.value.filter(
            (x) => x !== invite,
          ))
        }
      />
      <Toaster />
    </>
  )
}
