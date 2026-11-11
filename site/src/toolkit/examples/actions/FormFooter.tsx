import { Button, Input, Row, Stack } from '@kerf-js/veneer'

export const ButtonFormFooter = () => (
  <Stack
    as="form"
    gap="group"
    onSubmit={(e: Event) => e.preventDefault()}
  >
    <Input
      label="Project name"
      defaultValue="storefront"
    />
    <Row
      gap="related"
      justify="end"
    >
      <Button
        emphasis="ghost"
        tone="neutral"
      >
        Cancel
      </Button>
      <Button type="submit">Save changes</Button>
    </Row>
  </Stack>
)
