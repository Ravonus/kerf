import { state } from '@weft-js/core'
import {
  Button,
  CommandPalette,
  Stack,
  Text,
} from '@weft-js/warp'
import { COMMANDS, findProjects } from './shared'

export function CommandPaletteSearch() {
  const open = state(false)
  const last = state('Nothing yet')
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
        Find a project
      </Button>
      <Text subtle>Opened: {last.value}</Text>
      <CommandPalette
        open={open}
        hotkey=""
        placeholder="Search projects, like store or api"
        commands={COMMANDS}
        sources={[findProjects]}
        onRun={(c) => (last.value = c.label)}
      />
    </Stack>
  )
}
