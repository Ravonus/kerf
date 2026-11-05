import { state } from '@weft-js/core'
import { Button, CommandPalette } from '@weft-js/warp'
import { COMMANDS } from './shared'

export function CommandPaletteBasic() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        icon="search"
        onClick={() => (open.value = true)}
      >
        Search commands
      </Button>
      <CommandPalette
        open={open}
        hotkey=""
        commands={COMMANDS}
      />
    </>
  )
}
