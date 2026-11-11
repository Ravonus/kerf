import { Link, Row } from '@kerf-js/veneer'

export const LinkFooter = () => (
  <Row
    gap="group"
    justify="center"
  >
    <Link
      subtle
      href="/learn"
    >
      Learn
    </Link>
    <Link
      subtle
      href="/toolkit"
    >
      Components
    </Link>
    <Link
      subtle
      external
      href="https://example.com"
    >
      Status
    </Link>
  </Row>
)
