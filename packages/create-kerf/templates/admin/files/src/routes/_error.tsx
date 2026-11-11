import { Link, type Meta } from '@kerf-js/start'
import { Center, Heading, Stack, Text } from '@kerf-js/veneer'

export const meta: Meta = { title: 'Something went wrong' }

export default function ServerError() {
  return (
    <main class="system-page">
      <Center max="narrow" gutter>
        <Stack gap="group" align="center">
          <Heading level={1} role="title">
            Something went wrong on our side
          </Heading>
          <Text subtle>Your orders are safe. Give it a minute and try again.</Text>
          <Link href="/admin">Back to the overview</Link>
        </Stack>
      </Center>
    </main>
  )
}
