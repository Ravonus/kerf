import { Link, type Meta } from '@kerf/start'
import { Center, Heading, Stack, Text } from '@kerf/veneer'

export const meta: Meta = { title: 'Not on the shelves' }

export default function NotFound() {
  return (
    <Center max="narrow" gutter>
      <Stack gap="group" align="center" class="system-page">
        <Heading level={1} role="title">
          Not on the shelves
        </Heading>
        <Text subtle>That piece may be gone, or the address mistyped.</Text>
        <Link href="/">Back to the aisles</Link>
      </Stack>
    </Center>
  )
}
