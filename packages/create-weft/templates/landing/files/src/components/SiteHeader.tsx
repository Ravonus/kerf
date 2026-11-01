import { Link } from '@weft/start'
import { Center, Nav, Row } from '@weft/warp'

export function SiteHeader() {
  return (
    <header class="site-head">
      <Center max="wide" gutter>
        <Row justify="between" gap="group" wrap={false}>
          <Link href="/" class="brand">Emberline</Link>
          <Row gap="group" wrap={false}>
            <Nav label="Main">
              <Link href="/pricing">Pricing</Link>
              <Link href="/privacy">Privacy</Link>
            </Nav>
            <Link href="/#join" class="cta" data-size="sm">Get early access</Link>
          </Row>
        </Row>
      </Center>
    </header>
  )
}
