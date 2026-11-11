import { Bell, Row } from '@kerf-js/veneer'

export const BellTile = () => (
  <Row gap="group">
    <Bell count={3} />
    <Bell count={12} />
  </Row>
)
