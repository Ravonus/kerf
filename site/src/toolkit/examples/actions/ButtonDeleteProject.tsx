import { Button, Row, Stack, Text } from '@weft-js/warp'

export const ButtonDeleteProject = () => (
  <Stack gap="related">
    <Text role="heading">Delete storefront?</Text>
    <Text subtle>Its 412 deploys and all its logs go too. This can't be undone.</Text>
    <Row gap="related" justify="end">
      <Button emphasis="ghost" tone="neutral">
        Keep it
      </Button>
      <Button tone="critical">Delete project</Button>
    </Row>
  </Stack>
)
