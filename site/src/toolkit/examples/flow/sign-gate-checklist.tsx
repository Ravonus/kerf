import { derived, state } from '@kerf-js/core'
import {
  Button,
  Card,
  Checklist,
  Segmented,
  SignGate,
  SignGateBadge,
  Stack,
  Toaster,
} from '@kerf-js/veneer'
import type { SignStatus } from '@kerf-js/veneer'

// -- signature gate --

const SIGN_STATES: {
  value: SignStatus
  label: string
}[] = [
  { value: 'unsigned', label: 'Unsigned' },
  { value: 'pending', label: 'Pending' },
  { value: 'signed', label: 'Signed' },
  { value: 'expired', label: 'Expired' },
  { value: 'error', label: 'Error' },
]

export function SignGateLiveKeys() {
  const status = state<SignStatus>('unsigned')
  return (
    <Stack gap="group">
      <Segmented
        label="What the provider says"
        size="sm"
        value={status.value}
        options={SIGN_STATES}
        onChange={(v) => (status.value = v)}
      />
      <SignGate
        status={status.value}
        src="about:blank"
        title="Sign the data agreement to use live keys"
        description="Two pages. It takes about a minute."
        onResend={() => (status.value = 'unsigned')}
        onRetry={() => (status.value = 'unsigned')}
      >
        <Card title="Live API keys">
          <Button>Create live key</Button>
        </Card>
      </SignGate>
    </Stack>
  )
}

const ALL_SIGN_STATES: SignStatus[] = [
  'unsigned',
  'pending',
  'signed',
  'expired',
  'declined',
  'error',
]

export const SignGateBadgeStates = () => (
  <>
    {ALL_SIGN_STATES.map((status) => (
      <SignGateBadge
        key={status}
        status={status}
      />
    ))}
  </>
)

// -- onboarding --

const STEPS = [
  {
    id: 'project',
    title: 'Create your first project',
    description:
      'Projects hold your services and deploys.',
  },
  {
    id: 'repo',
    title: 'Connect a repository',
    description: 'Deploy on every push to main.',
  },
  {
    id: 'invite',
    title: 'Invite your team',
    description: 'Add teammates by email.',
  },
]

export function ChecklistSetup() {
  const done = state(['project'])
  const finish = (id: string) =>
    (done.value = [...done.value, id])
  const items = derived(() =>
    STEPS.map((step) => ({
      ...step,
      done: done.value.includes(step.id),
      action: {
        label: 'Do it',
        onClick: () => finish(step.id),
      },
    })),
  )
  return (
    <>
      <Checklist
        subtitle="Three steps to your first deploy."
        items={items.value}
        doneDescription="This card tidies itself away."
        onHide={() => {}}
        onUndoHide={() => {}}
      />
      <Toaster />
    </>
  )
}

export function ChecklistSelfChecked() {
  const done = state<string[]>([])
  const toggle = (id: string, on: boolean) =>
    (done.value = on
      ? [...done.value, id]
      : done.value.filter((x) => x !== id))
  const items = derived(() =>
    STEPS.map((step) => ({
      ...step,
      done: done.value.includes(step.id),
    })),
  )
  return (
    <Checklist
      title="Launch day"
      items={items.value}
      onToggle={toggle}
    />
  )
}
