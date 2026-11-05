import { state } from '@weft-js/core'
import {
  Button,
  CommandPalette,
  Stack,
  Text,
} from '@weft-js/warp'
import { COMMANDS } from './shared'

export function CommandPaletteRun() {
  const open = state(false)
  const last = state('Nothing yet')
  return (
    <Stack
      gap="related"
      align="center"
    >
      <Button onClick={() => (open.value = true)}>
        Open the palette
      </Button>
      <Text subtle>Last run: {last.value}</Text>
      <CommandPalette
        open={open}
        hotkey=""
        commands={COMMANDS}
        onRun={(c) => (last.value = c.label)}
      />
    </Stack>
  )
}
