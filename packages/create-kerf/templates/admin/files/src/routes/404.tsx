import { Link, type Meta } from '@kerf-js/start'
import { Center, Heading, Stack, Text } from '@kerf-js/veneer'

export const meta: Meta = { title: 'Page not found' }

export default function NotFound() {
  return (
    <main class="system-page">
      <Center max="narrow" gutter>
        <Stack gap="group" align="center">
          <Heading level={1} role="title">
            Nothing on this shelf
          </Heading>
          <Text subtle>The order may be gone, or the address mistyped.</Text>
          <Link href="/admin">Back to the overview</Link>
        </Stack>
      </Center>
    </main>
  )
}
