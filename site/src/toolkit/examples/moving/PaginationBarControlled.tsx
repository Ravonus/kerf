import { state } from '@kerf/core'
import {
  Button,
  PaginationBar,
  Row,
  Stack,
  Text,
} from '@kerf/veneer'

export function PaginationBarControlled() {
  const page = state(8)
  const size = state(10)
  return (
    <Stack gap="related">
      <PaginationBar
        label="Projects"
        page={page}
        size={size}
        total={240}
      />
      <Row gap="related">
        <Button
          size="sm"
          emphasis="outline"
          tone="neutral"
          onClick={() => (page.value = 1)}
        >
          Back to the start
        </Button>
        <Text subtle>
          Page {page.value}, set from outside
        </Text>
      </Row>
    </Stack>
  )
}
