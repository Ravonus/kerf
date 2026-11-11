import { Stack, Row, Text, Kbd } from '@kerf-js/veneer'
import { SHORTCUTS } from './shortcut-data'

export const KbdShortcutList = () => (
  <Stack
    gap="related"
    divided
  >
    {SHORTCUTS.map((s) => (
      <Row
        key={s.does}
        justify="between"
        gap="group"
      >
        <Text>{s.does}</Text>
        <Row gap="hair">
          {s.keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </Row>
      </Row>
    ))}
  </Stack>
)
