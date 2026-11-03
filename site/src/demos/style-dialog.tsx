import { state } from '@weft-js/core'
import { Button, Card, Input, Menu, Modal, Row, Stack, Text } from '@weft-js/warp'

export default function Project() {
  const name = state('storefront')
  const renaming = state(false)
  const draft = state('')
  const open = () => {
    draft.value = name.value
    renaming.value = true
  }
  const save = () => {
    name.value = draft.value.trim() || name.value
    renaming.value = false
  }
  return (
    <Card title="Project">
      <Row justify="between">
        <Text role="heading">{name.value}</Text>
        <Menu
          label="Actions"
          trigger={{ emphasis: 'outline', tone: 'neutral', size: 'sm' }}
          items={[
            { label: 'Rename', icon: 'pencil', onSelect: open },
            { separator: true },
            { label: 'Delete', icon: 'trash', tone: 'critical', disabled: true },
          ]}
        />
      </Row>
      <Modal
        open={renaming}
        size="sm"
        title="Rename project"
        footer={
          <>
            <Button emphasis="ghost" tone="neutral" data-close="">Cancel</Button>
            <Button onClick={save}>Save</Button>
          </>
        }
      >
        <Stack gap="related">
          <Input label="Project name" autofocus value={draft.value} onInput={e => (draft.value = e.currentTarget.value)} />
        </Stack>
      </Modal>
    </Card>
  )
}
