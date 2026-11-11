import { onMount, state } from '@kerf/core'
import {
  Alert,
  Button,
  Row,
  Stack,
  Text,
  Toaster,
  toast,
} from '@kerf/veneer'
import type { ToastTone } from './toasts'

export function ToasterDismissed() {
  const id = state('')
  const start = () =>
    (id.value = toast.show({
      title: 'Watching for failures',
      description: 'This stays until you stop it.',
      duration: 0,
    }))
  const stop = () => {
    toast.dismiss(id.value)
    id.value = ''
  }
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        disabled={!!id.value}
        onClick={start}
      >
        Start
      </Button>
      <Button
        emphasis="outline"
        tone="neutral"
        disabled={!id.value}
        onClick={stop}
      >
        Stop
      </Button>
      <Toaster />
    </>
  )
}

export function ToasterAfterRedirect() {
  onMount(() =>
    toast.show({
      title: 'Welcome back, Mara',
      description:
        'You have two failed deploys to look at.',
      tone: 'info',
    }),
  )
  return (
    <>
      <Text subtle>
        This one fires as the page arrives. Press Replay.
      </Text>
      <Toaster />
    </>
  )
}

export const AlertPlay = ({
  tone,
  title,
  children,
  live,
}: {
  tone: ToastTone
  title: string
  children: string
  live: boolean
}) => (
  <Alert
    tone={tone}
    title={title}
    live={live}
  >
    {children}
  </Alert>
)

export const AlertTones = () => (
  <Stack gap="related">
    <Alert
      tone="info"
      title="Maintenance on Sunday"
    >
      Deploys pause for an hour from 02:00 UTC.
    </Alert>
    <Alert
      tone="positive"
      title="All regions healthy"
    >
      Every check passed in the last hour.
    </Alert>
    <Alert
      tone="caution"
      title="Close to your limit"
    >
      You've used 82% of this month's build minutes.
    </Alert>
    <Alert
      tone="critical"
      title="Deploy failed"
    >
      mobile-bff stopped at the health check.
    </Alert>
  </Stack>
)

export const AlertTitleOnly = () => (
  <Alert
    tone="positive"
    title="Domain verified"
  />
)

export const AlertBodyOnly = () => (
  <Alert tone="info">
    Previews are removed 30 days after their branch is
    deleted.
  </Alert>
)

export const AlertWithActions = () => (
  <Alert
    tone="critical"
    title="Deploy failed"
    actions={
      <>
        <Button
          size="sm"
          tone="critical"
        >
          Retry
        </Button>
        <Button
          size="sm"
          emphasis="ghost"
          tone="neutral"
        >
          See logs
        </Button>
      </>
    }
  >
    mobile-bff stopped at the health check after four
    minutes.
  </Alert>
)

export function AlertDismiss() {
  const shown = state(true)
  return (
    <Stack>
      {shown.value ? (
        <Alert
          tone="info"
          title="New: preview comments"
          onDismiss={() => (shown.value = false)}
        >
          Your team can now comment on any preview.
        </Alert>
      ) : (
        <Row justify="center">
          <Button
            emphasis="ghost"
            tone="neutral"
            onClick={() => (shown.value = true)}
          >
            Show it again
          </Button>
        </Row>
      )}
    </Stack>
  )
}
