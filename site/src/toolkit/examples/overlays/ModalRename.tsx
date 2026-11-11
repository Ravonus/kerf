import { state } from '@kerf/core'
import {
  Button,
  Input,
  Modal,
  Stack,
  Text,
} from '@kerf/veneer'

export function ModalRename() {
  const open = state(false)
  const name = state('storefront')
  const save = (e: Event) => {
    e.preventDefault()
    open.value = false
  }
  return (
    <Stack
      gap="related"
      align="center"
    >
      <Text role="heading">{name.value}</Text>
      <Button
        emphasis="outline"
        tone="neutral"
        icon="pencil"
        onClick={() => (open.value = true)}
      >
        Rename
      </Button>
      <Modal
        open={open}
        size="sm"
        title="Rename project"
        footer={
          <>
            <Button
              emphasis="ghost"
              tone="neutral"
              data-close=""
            >
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </>
        }
      >
        <Input
          label="Project name"
          autofocus
          value={name.value}
          onInput={(e: Event) =>
            (name.value = (
              e.target as HTMLInputElement
            ).value)
          }
        />
      </Modal>
    </Stack>
  )
}
