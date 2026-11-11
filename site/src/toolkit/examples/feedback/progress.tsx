import { derived, onCleanup, state } from '@kerf-js/core'
import {
  Button,
  Card,
  Progress,
  Row,
  Skeleton,
  Spinner,
  Stack,
  Text,
} from '@kerf-js/veneer'

export function ProgressRun() {
  const pct = state(0)
  const steps = derived(() =>
    pct.value < 40
      ? 'Installing dependencies'
      : pct.value < 80
        ? 'Building'
        : pct.value < 100
          ? 'Uploading'
          : 'Live',
  )
  const timer = setInterval(
    () => (pct.value = Math.min(100, pct.value + 2)),
    80,
  )
  onCleanup(() => clearInterval(timer))
  return (
    <Stack>
      <Progress
        label={steps.value}
        tone={pct.value === 100 ? 'positive' : undefined}
        value={pct.value}
      />
    </Stack>
  )
}

export const ProgressPlanUsage = () => (
  <Card
    eyebrow="October"
    title="Your plan"
  >
    <Stack gap="group">
      <Progress
        label="Build minutes"
        value={82}
        tone="caution"
      />
      <Progress
        label="Bandwidth"
        value={46}
      />
      <Progress
        label="Seats"
        value={80}
      />
    </Stack>
  </Card>
)

export const SpinnerPlay = ({
  size,
  label,
}: {
  size: 'sm' | 'md' | 'lg'
  label: string
}) => (
  <Spinner
    size={size}
    label={label}
  />
)

export const SpinnerSizes = () => (
  <>
    <Spinner
      size="sm"
      label="Loading"
    />
    <Spinner label="Loading" />
    <Spinner
      size="lg"
      label="Loading"
    />
  </>
)

export const SpinnerInline = () => (
  <Row gap="related">
    <Spinner size="sm" />
    <Text subtle>Checking the domain</Text>
  </Row>
)

export function SpinnerRefresh() {
  const busy = state(false)
  const when = state('2 minutes ago')
  const refresh = () => {
    busy.value = true
    setTimeout(() => {
      busy.value = false
      when.value = 'just now'
    }, 1400)
  }
  return (
    <Row
      justify="between"
      gap="group"
    >
      <Stack gap="hair">
        <Text role="heading">storefront logs</Text>
        <Text subtle>Updated {when.value}</Text>
      </Stack>
      {busy.value ? (
        <Spinner label="Refreshing logs" />
      ) : (
        <Button
          size="sm"
          emphasis="outline"
          tone="neutral"
          icon="refresh"
          onClick={refresh}
        >
          Refresh
        </Button>
      )}
    </Row>
  )
}

export const SpinnerPanel = () => (
  <Card>
    <Stack
      gap="related"
      align="center"
    >
      <Spinner
        size="lg"
        label="Waiting for the first build"
      />
      <Text subtle>Waiting for the first build</Text>
    </Stack>
  </Card>
)

export const SkeletonPlay = ({
  shape,
  lines,
  width,
  height,
}: {
  shape: 'text' | 'circle' | 'block'
  lines: number
  width: string
  height: string
}) => (
  <Stack gap="tight">
    <Skeleton
      shape={shape}
      lines={lines}
      width={width || undefined}
      height={height || undefined}
    />
  </Stack>
)

export const SkeletonShapes = () => (
  <Stack gap="group">
    <Skeleton />
    <Skeleton
      shape="circle"
      width="48px"
      height="48px"
    />
    <Skeleton
      shape="block"
      height="96px"
    />
  </Stack>
)
