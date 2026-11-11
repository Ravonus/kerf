import { state } from '@kerf-js/core'
import {
  Button,
  Drawer,
  Input,
  Row,
  Stack,
  Switch,
} from '@kerf-js/veneer'

export function DrawerFooter() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        icon="settings"
        onClick={() => (open.value = true)}
      >
        Edit build settings
      </Button>
      <Drawer
        open={open}
        title="Build settings"
        description="Applied on the next deploy."
        footer={
          <Row
            gap="related"
            justify="end"
          >
            <Button
              emphasis="ghost"
              tone="neutral"
              data-close=""
            >
              Cancel
            </Button>
            <Button data-close="">Save</Button>
          </Row>
        }
      >
        <Stack gap="group">
          <Input
            label="Build command"
            defaultValue="npm run build"
          />
          <Input
            label="Output folder"
            defaultValue="dist"
          />
          <Switch defaultChecked>
            Cache dependencies
          </Switch>
        </Stack>
      </Drawer>
    </>
  )
}
