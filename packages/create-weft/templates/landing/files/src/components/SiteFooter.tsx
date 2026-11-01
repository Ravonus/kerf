import { Link } from '@weft/start'
import { Center, Link as TextLink, Row, Stack, Text } from '@weft/warp'

export function SiteFooter() {
  return (
    <footer class="site-foot">
      <Center max="wide" gutter>
        <Row justify="between" gap="section" reflow="tablet">
          <Stack gap="tight">
            <Link href="/" class="brand">Emberline</Link>
            <Text subtle>Hear what customers keep asking for.</Text>
          </Stack>
          <Row gap="group" as="nav" aria-label="Footer">
            <Link href="/pricing">Pricing</Link>
            <Link href="/privacy">Privacy</Link>
            <TextLink href="mailto:hello@emberline.example">hello@emberline.example</TextLink>
          </Row>
        </Row>
        <Text role="caption" faint class="site-foot-legal">© 2026 Emberline. Built for teams that listen.</Text>
      </Center>
    </footer>
  )
}
