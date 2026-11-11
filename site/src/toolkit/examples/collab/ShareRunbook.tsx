import { state } from '@kerf/core'

import {
  Button,
  PresenceStack,
  ShareDialog,
  Stack,
  Toaster,
} from '@kerf/veneer'

import type {
  ShareLink,
  ShareMember,
  ShareRole,
} from '@kerf/veneer'

import { SHARE_MEMBERS, SHARE_PEOPLE } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export function ShareDialogRunbook() {
  const open = state(false)
  const members = state<ShareMember[]>(SHARE_MEMBERS)
  const link = state<ShareLink>({
    access: 'restricted',
    role: 'viewer',
  })
  const invite = (emails: string[], role: ShareRole) => {
    const added = emails.map((email) => ({
      id: email,
      name: email.split('@')[0]!,
      email,
      role,
    }))
    members.value = [...members.value, ...added]
  }
  const change = (
    m: ShareMember,
    role: ShareRole | null,
  ) => {
    members.value = role
      ? members.value.map((x) =>
          x.id === m.id ? { ...x, role } : x,
        )
      : members.value.filter((x) => x !== m)
  }
  return (
    <>
      <Stack
        gap="related"
        align="center"
      >
        <PresenceStack peers={members.value} />
        <Button
          icon="share"
          onClick={() => (open.value = true)}
        >
          Share
        </Button>
      </Stack>
      <ShareDialog
        open={open}
        title="Rollback runbook"
        members={members}
        people={SHARE_PEOPLE}
        link={link}
        url="https://kerf.dev/d/rollback-runbook"
        onInvite={invite}
        onRoleChange={change}
        onLinkAccess={(v) => (link.value = v)}
      />
      <Toaster />
    </>
  )
}
