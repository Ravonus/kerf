import {
  Button,
  Heading,
  Row,
  Stack,
  Text,
} from '@kerf/veneer'

export const RowPageHeader = () => (
  <Row
    justify="between"
    gap="group"
    reflow="tablet"
  >
    <Stack gap="hair">
      <Heading
        level={3}
        role="title"
      >
        storefront
      </Heading>
      <Text subtle>
        Live in eu-west. Last deploy 2 hours ago.
      </Text>
    </Stack>
    <Row gap="tight">
      <Button
        emphasis="outline"
        tone="neutral"
        icon="terminal"
      >
        Logs
      </Button>
      <Button icon="rocket">Deploy</Button>
    </Row>
  </Row>
)
