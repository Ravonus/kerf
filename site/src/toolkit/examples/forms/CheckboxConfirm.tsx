import { state } from '@weft-js/core'
import { Button, Checkbox, Row, Stack, Text } from '@weft-js/warp'

export function CheckboxConfirm() {
  const sure = state(false)
  const tried = state(false)
  const gone = state(false)
  const remove = () => {
    tried.value = true
    if (sure.value) gone.value = true
  }
  return (
    <Stack gap="group">
      <Text>
        {gone.value
          ? 'reports was deleted.'
          : 'Deleting reports removes its 41 deploys and all its logs.'}
      </Text>
      <Checkbox
        checked={sure.value}
        error={tried.value && !sure.value ? 'Tick this first.' : undefined}
        onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
          (sure.value = e.currentTarget.checked)
        }
      >
        I understand this can't be undone
      </Checkbox>
      <Row justify="end">
        <Button tone="critical" onClick={remove}>
          Delete project
        </Button>
      </Row>
    </Stack>
  )
}
