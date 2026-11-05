import { ControlBar, Stack, Text } from '@weft-js/warp'
import { useControls } from './shared'

export function ControlBarCall() {
  const {
    mic,
    camera,
    sharing,
    hand,
    side,
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
        mic={mic.value}
        camera={camera.value}
        sharing={sharing.value}
        hand={hand.value}
        side={side.value}
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
