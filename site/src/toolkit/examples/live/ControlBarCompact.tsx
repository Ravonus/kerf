import { ControlBar, Stack, Text } from '@weft-js/warp'
import { useControls } from './shared'

export function ControlBarCompact() {
  const c = useControls()
  return (
    <Stack gap="related" align="center">
      <ControlBar
        compact
        mic={c.mic.value}
        camera={c.camera.value}
        sharing={c.sharing.value}
        hand={c.hand.value}
        onToggle={c.onToggle}
        onLeave={c.onLeave}
      />
      <Text role="caption" subtle>
        {c.said.value}
      </Text>
    </Stack>
  )
}
