import { Link, type Meta } from '@weft-js/start'
import { Center, Heading, Stack, Text } from '@weft-js/warp'

export const meta: Meta = { title: 'Something went wrong' }

export default function ServerError() {
  return (
    <section class="page-head">
      <Center max="narrow" gutter>
        <Stack gap="group" align="center">
          <Heading level={1} role="display">
            Something went wrong on our side
          </Heading>
          <Text class="lede" subtle>
            It isn't you. Give it a minute and try again.
          </Text>
          <Link href="/" class="cta">
            Back to the home page
          </Link>
        </Stack>
      </Center>
    </section>
  )
}
