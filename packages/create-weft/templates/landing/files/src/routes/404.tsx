import { Link, type Meta } from '@weft-js/start'
import { Center, Heading, Stack, Text } from '@weft-js/warp'

export const meta: Meta = { title: 'Page not found' }

export default function NotFound() {
  return (
    <section class="page-head">
      <Center max="narrow" gutter>
        <Stack gap="group" align="center">
          <Heading level={1} role="display">We can't find that page</Heading>
          <Text class="lede" subtle>The link may be old, or the address mistyped.</Text>
          <Link href="/" class="cta">Back to the home page</Link>
        </Stack>
      </Center>
    </section>
  )
}
