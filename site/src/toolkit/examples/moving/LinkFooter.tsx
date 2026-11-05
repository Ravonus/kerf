import { Link, Row } from '@weft-js/warp'

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
