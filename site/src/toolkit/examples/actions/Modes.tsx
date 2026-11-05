import { state } from '@weft-js/core'
import {
  Button,
  CommandPalette,
  Stack,
  Text,
} from '@weft-js/warp'
import { COMMANDS, MODES } from './shared'

export function CommandPaletteModes() {
  const open = state(false)
  return (
    <Stack
      gap="related"
      align="center"
    >
      <Button
        emphasis="outline"
        tone="neutral"
        icon="search"
        onClick={() => (open.value = true)}
      >
        Search everything
      </Button>
      <Text subtle>
        Type @ for people or # for projects.
      </Text>
      <CommandPalette
        open={open}
        hotkey=""
        commands={COMMANDS}
        modes={MODES}
        groupOrder={['Go to', 'Projects', 'Team']}
      />
    </Stack>
  )
}
