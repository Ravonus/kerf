import { ControlBar, Stack, Text } from '@weft-js/warp'
import { useControls } from './shared'

export function ControlBarCall() {
  const c = useControls()
  return (
    <Stack gap="related" align="center">
      <ControlBar
        mic={c.mic.value}
        camera={c.camera.value}
        sharing={c.sharing.value}
        hand={c.hand.value}
        side={c.side.value}
        onToggle={c.onToggle}
        onLeave={c.onLeave}
      />
      <Text role="caption" subtle>
        {c.said.value}
      </Text>
    </Stack>
  )
}
