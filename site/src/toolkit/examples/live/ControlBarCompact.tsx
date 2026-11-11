import { ControlBar, Stack, Text } from '@kerf/veneer'
import { useControls } from './shared'

export function ControlBarCompact() {
  const {
    mic,
    camera,
    sharing,
    hand,
    onToggle,
    onLeave,
    said,
  } = useControls()
  return (
    <Stack
      gap="related"
      align="center"
    >
      <ControlBar
        compact
        mic={mic.value}
        camera={camera.value}
        sharing={sharing.value}
        hand={hand.value}
        onToggle={onToggle}
        onLeave={onLeave}
      />
      <Text
        role="caption"
        subtle
      >
        {said.value}
      </Text>
    </Stack>
  )
}
