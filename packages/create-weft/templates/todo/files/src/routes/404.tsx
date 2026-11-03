import { Link, type Meta } from '@weft-js/start'
import { Center, Heading, Stack, Text } from '@weft-js/warp'

export const meta: Meta = { title: 'Page not found' }

export default function NotFound() {
  return (
    <main class="system-page">
      <Center max="narrow" gutter>
        <Stack gap="group" align="center">
          <Heading level={1} role="title">That page isn't in the book</Heading>
          <Text subtle>The link may be old, or the address mistyped.</Text>
          <Link href="/todos">Back to your list</Link>
        </Stack>
      </Center>
    </main>
  )
}
