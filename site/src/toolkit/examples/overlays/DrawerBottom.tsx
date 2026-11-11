import { state } from '@kerf/core'
import { Button, Drawer, Text } from '@kerf/veneer'

export function DrawerBottom() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Bottom
      </Button>
      <Drawer
        open={open}
        side="bottom"
        title="Share"
      >
        <Text subtle>
          For a quick task, and on phones.
        </Text>
      </Drawer>
    </>
  )
}
