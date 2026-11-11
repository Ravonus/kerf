import { state } from '@kerf/core'
import {
  Alert,
  Button,
  Input,
  Progress,
  Row,
  Stack,
} from '@kerf/veneer'
import type { ToastTone } from './toasts'

export function AlertFormError() {
  const domain = state('')
  const failed = state(false)
  const save = (e: Event) => {
    e.preventDefault()
    failed.value = !domain.value.includes('.')
  }
  return (
    <Stack
      as="form"
      gap="group"
      onSubmit={save}
    >
      {failed.value && (
        <Alert
          live
          tone="critical"
          title="That domain won't work"
        >
          Use a full domain, like shop.kerf.dev.
        </Alert>
      )}
      <Input
        label="Domain"
        placeholder="shop.kerf.dev"
        value={domain.value}
        onInput={(e: Event) =>
          (domain.value = (
            e.target as HTMLInputElement
          ).value)
        }
      />
      <Row justify="end">
        <Button type="submit">Add domain</Button>
      </Row>
    </Stack>
  )
}

export function AlertUsage() {
  const upgraded = state(false)
  return (
    <Stack>
      {upgraded.value ? (
        <Alert
          tone="positive"
          title="You're on Scale"
        >
          Your new build minutes are ready.
        </Alert>
      ) : (
        <Alert
          tone="caution"
          title="82% of build minutes used"
          actions={
            <Button
              size="sm"
              onClick={() => (upgraded.value = true)}
            >
              Upgrade
            </Button>
          }
        >
          At this pace you'll run out on the 26th, and
          deploys will queue.
        </Alert>
      )}
    </Stack>
  )
}

export const ProgressPlay = ({
  label,
  value,
  shape,
  tone,
}: {
  label: string
  value: number
  shape: 'linear' | 'circle'
  tone: ToastTone
}) => (
  <Stack>
    <Progress
      label={label}
      value={value}
      shape={shape}
      tone={tone}
    />
  </Stack>
)

export const ProgressBar = () => (
  <Stack gap="group">
    <Progress
      label="Build"
      value={35}
    />
    <Progress
      label="Upload"
      value={80}
    />
  </Stack>
)

export const ProgressCircle = () => (
  <>
    <Progress
      label="Uptime target"
      shape="circle"
      value={72}
    />
    <Progress
      label="Budget"
      shape="circle"
      tone="caution"
      value={91}
    />
    <Progress
      label="Syncing"
      shape="circle"
    />
  </>
)

export const ProgressTones = () => (
  <Stack gap="group">
    <Progress
      label="Build minutes"
      tone="positive"
      value={38}
    />
    <Progress
      label="Storage"
      tone="caution"
      value={82}
    />
    <Progress
      label="Seats"
      tone="critical"
      value={96}
    />
  </Stack>
)

export const ProgressIndeterminate = () => (
  <Stack>
    <Progress label="Waiting for a build machine" />
  </Stack>
)
