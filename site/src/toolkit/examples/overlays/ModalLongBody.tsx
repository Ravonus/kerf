import { state } from '@kerf-js/core'
import {
  Button,
  Modal,
  Stack,
  Text,
} from '@kerf-js/veneer'
import { DEPLOYS } from '../../world'

export function ModalLongBody() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        See all deploys
      </Button>
      <Modal
        open={open}
        title="Deploys today"
        description={
          'The header and footer stay' +
          ' put while the middle scrolls.'
        }
        footer={<Button data-close="">Close</Button>}
      >
        <Stack gap="group">
          {[...DEPLOYS, ...DEPLOYS].map((d, i) => (
            <Stack
              key={i}
              gap="hair"
            >
              <Text>{d.message}</Text>
              <Text
                role="caption"
                subtle
              >
                {d.author}, {d.project}, {d.minutes} min
              </Text>
            </Stack>
          ))}
        </Stack>
      </Modal>
    </>
  )
}
