import { Row, Icon, Text } from '@kerf-js/veneer'

export const IconLabelled = () => (
  <Row gap="related">
    <Icon
      name="alert-circle"
      size={24}
      label="Failed"
    />
    <Text>mobile-bff</Text>
  </Row>
)
