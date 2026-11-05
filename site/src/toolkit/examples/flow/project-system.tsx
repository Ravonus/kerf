import { state } from '@weft-js/core'
import {
  Button,
  Flow,
  Heading,
  Input,
  Row,
  Select,
  Stack,
  SystemPage,
  Text,
} from '@weft-js/warp'
import { PROJECTS } from '../../world'
import { WIZARD, FRAMEWORKS } from './tour-coachmark'

export function FlowNewProject() {
  const step = state('repo')
  const name = state('storefront')
  const at = () => WIZARD.indexOf(step.value)
  const back = () => {
    if (at() > 0) step.value = WIZARD[at() - 1]!
  }
  const steps = [
    {
      id: 'repo',
      label: 'Repository',
      render: () => (
        <Input
          label="Project name"
          data-autofocus
          value={name.value}
          onInput={(e) =>
            (name.value = e.currentTarget.value)
          }
        />
      ),
    },
    {
      id: 'build',
      label: 'Build',
      render: () => (
        <Select
          label="Framework"
          options={FRAMEWORKS}
          defaultValue="weft"
        />
      ),
    },
    {
      id: 'review',
      label: 'Review',
      render: () => (
        <Text>
          Ready to deploy {name.value} to eu-west.
        </Text>
      ),
    },
  ]
  return (
    <Stack gap="group">
      <Text role="label">Step {at() + 1} of 3</Text>
      <Flow
        steps={steps}
        step={step}
      />
      <Row
        gap="related"
        justify="end"
      >
        <Button
          emphasis="ghost"
          tone="neutral"
          aria-disabled={at() === 0 ? 'true' : undefined}
          onClick={back}
        >
          Back
        </Button>
        <Button
          onClick={() =>
            (step.value = WIZARD[(at() + 1) % 3]!)
          }
        >
          {at() === 2 ? 'Deploy' : 'Continue'}
        </Button>
      </Row>
    </Stack>
  )
}

// -- system states --

export const SystemPageTile = () => (
  <Stack
    gap="tight"
    align="center"
  >
    <Heading level={3}>We can't find that page</Heading>
    <Text subtle>404 · Not found</Text>
    <Button size="sm">Go to dashboard</Button>
  </Stack>
)

export const SystemPage404 = () => (
  <SystemPage
    as="h3"
    kind="404"
    onSearch={() => {}}
    searchLabel="Search weft"
    primary={{ label: 'Go to dashboard' }}
    secondary={{ label: 'Report a broken link' }}
    meta="/projects/9921 · ref req_8f2a1c"
  />
)

const ACCOUNTS = [
  {
    id: 'mara',
    email: 'mara@weft.dev',
    detail: 'weft · this workspace',
    current: true,
  },
  {
    id: 'side',
    email: 'mara@sample.dev',
    detail: 'Sample Co · has access',
    hasAccess: true,
  },
]

const PROJECT = {
  title: PROJECTS[3]!.name,
  owner: PROJECTS[3]!.owner,
}

export function SystemPage403() {
  const pending = state(false)
  return (
    <SystemPage
      as="h3"
      kind="403"
      autofocus={false}
      object={PROJECT}
      account="noor@weft.dev"
      accounts={ACCOUNTS}
      onSwitch={() => {}}
      request={{
        approvers: 'Mara and Jun',
        pending: pending.value,
        onSend: () => (pending.value = true),
        onWithdraw: () => (pending.value = false),
      }}
      requestId="req_7Q2K-91XF"
    />
  )
}
