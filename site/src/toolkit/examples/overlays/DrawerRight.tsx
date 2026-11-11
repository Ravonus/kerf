import { state } from '@kerf-js/core'
import { Button, Drawer, Text } from '@kerf-js/veneer'

export function DrawerRight() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Right
      </Button>
      <Drawer
        open={open}
        side="right"
        title="Deploy d-4821"
      >
        <Text subtle>
          For details of what you pressed.
        </Text>
      </Drawer>
    </>
  )
}
