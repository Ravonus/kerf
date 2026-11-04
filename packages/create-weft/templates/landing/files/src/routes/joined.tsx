import { Link, type Meta } from '@weft-js/start'
import { Center, Heading, Stack, Text } from '@weft-js/warp'

export const meta: Meta = {
  title: "You're on the list",
  extra: [{ name: 'robots', content: 'noindex' }],
}
export const prerender = true

export default function Joined() {
  return (
    <section class="page-head">
      <Center max="narrow" gutter>
        <Stack gap="group" align="center">
          <Heading level={1} role="display">
            You're on the list
          </Heading>
          <Text class="lede" subtle>
            We'll write when your place in line comes up. Everyone hears from us in the order they
            joined.
          </Text>
          <Link href="/pricing" class="cta" data-emphasis="outline">
            See pricing
          </Link>
        </Stack>
      </Center>
    </section>
  )
}
