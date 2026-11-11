import {
  Boundary,
  onCleanup,
  resource,
  state,
} from '@kerf-js/core'
import {
  Card,
  LiveStatus,
  Row,
  Shape,
  Skeleton,
  Stack,
  Text,
} from '@kerf-js/veneer'
import type { LiveState } from '@kerf-js/veneer'
import { PROJECTS } from '../../world'

export const SkeletonLines = () => (
  <Stack gap="tight">
    <Skeleton lines={4} />
  </Stack>
)

export const SkeletonProfile = () => (
  <Row
    gap="related"
    align="start"
  >
    <Skeleton
      shape="circle"
      width="40px"
      height="40px"
    />
    <Stack gap="tight">
      <Skeleton width="10rem" />
      <Skeleton width="16rem" />
    </Stack>
  </Row>
)

export function SkeletonThenContent() {
  const ready = state(false)
  const timer = setTimeout(
    () => (ready.value = true),
    1800,
  )
  onCleanup(() => clearTimeout(timer))
  return (
    <Card>
      {ready.value ? (
        <Stack gap="tight">
          <Text role="heading">checkout</Text>
          <Text subtle>
            Add Apple Pay to the last step, by Tomás. Live
            in eu-west.
          </Text>
        </Stack>
      ) : (
        <Stack gap="tight">
          <Skeleton width="40%" />
          <Skeleton lines={2} />
        </Stack>
      )}
    </Card>
  )
}

export const ShapePlay = ({
  kind,
  rows,
  lines,
}: {
  kind: 'text' | 'list' | 'card' | 'media' | 'table'
  rows: number
  lines: number
  label: string
}) => (
  <Stack>
    <Shape
      kind={kind}
      rows={rows}
      cols={4}
      lines={lines}
    />
  </Stack>
)

export const ShapeList = () => (
  <Stack>
    <Shape
      kind="list"
      rows={3}
    />
  </Stack>
)

export const ShapeParagraph = () => (
  <Stack>
    <Shape
      kind="text"
      lines={4}
    />
  </Stack>
)

export const ShapeTile = () => (
  <Stack>
    <Shape
      kind="card"
      media="16/9"
      lines={2}
    />
  </Stack>
)

export const ShapeTable = () => (
  <Stack>
    <Shape
      kind="table"
      rows={4}
      cols={4}
    />
  </Stack>
)

export const ShapeMedia = () => (
  <Stack>
    <Shape
      kind="media"
      media="21/9"
    />
  </Stack>
)

const later = <T,>(value: T) =>
  new Promise<T>((done) => {
    setTimeout(done, 1800, value)
  })

function Team() {
  const list = resource(() => later(PROJECTS.slice(0, 4)))
  return (
    <Stack gap="related">
      {(list.value ?? []).map((p) => (
        <Row
          key={p.id}
          justify="between"
        >
          <Text>{p.owner}</Text>
          <Text subtle>{p.name}</Text>
        </Row>
      ))}
    </Stack>
  )
}

export const ShapeBoundary = () => (
  <Boundary
    pending={
      <Shape
        kind="text"
        lines={4}
        label="Loading owners"
      />
    }
  >
    <Team />
  </Boundary>
)

export const LiveStatusPlay = ({
  state: status,
  label,
  children,
}: {
  state: LiveState
  label: string
  children: string
}) => (
  <LiveStatus
    state={status}
    label={label}
  >
    {children || undefined}
  </LiveStatus>
)

export const LiveStatusStates = () => (
  <>
    <LiveStatus state="connecting" />
    <LiveStatus state="live" />
    <LiveStatus state="reconnecting" />
    <LiveStatus state="offline" />
  </>
)
