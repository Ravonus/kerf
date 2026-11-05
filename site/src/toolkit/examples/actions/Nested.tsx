import { state } from '@weft-js/core'
import {
  Button,
  CommandPalette,
  Stack,
  Text,
} from '@weft-js/warp'
import type { Command } from '@weft-js/warp'
import { REGIONS } from '../../world'

/** A row with `children` opens a second list in place.
 * Each child's `run` does the work.
 */
export function CommandPaletteNested() {
  const open = state(false)
  const region = state('eu-west')
  const commands: Command[] = [
    {
      id: 'region',
      label: 'Move storefront to…',
      title: 'Region',
      group: 'Projects',
      icon: 'globe',
      children: () =>
        REGIONS.map(({ region: r }) => ({
          id: r,
          label: r,
          group: 'Regions',
          icon: 'pin',
          run: () => (region.value = r),
        })),
    },
    {
      id: 'deploy',
      label: 'Deploy storefront',
      group: 'Projects',
      icon: 'rocket',
      shortcut: '⌘D',
    },
  ]
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
        Search commands
      </Button>
      <Text subtle>
        storefront runs in {region.value}
      </Text>
      <CommandPalette
        open={open}
        hotkey=""
        commands={commands}
      />
    </Stack>
  )
}
