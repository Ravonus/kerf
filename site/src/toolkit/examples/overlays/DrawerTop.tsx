import { state } from '@kerf/core'
import { Button, Drawer, Text } from '@kerf/veneer'

export function DrawerTop() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Top
      </Button>
      <Drawer
        open={open}
        side="top"
        title="Search"
      >
        <Text subtle>
          For a search or a short notice.
        </Text>
      </Drawer>
    </>
  )
}
