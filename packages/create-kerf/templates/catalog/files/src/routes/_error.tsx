import { Link, type Meta } from '@kerf-js/start'
import { Center, Heading, Stack, Text } from '@kerf-js/veneer'

export const meta: Meta = { title: 'Something went wrong' }

export default function ServerError() {
  return (
    <Center max="narrow" gutter>
      <Stack gap="group" align="center" class="system-page">
        <Heading level={1} role="title">
          Something broke on our bench
        </Heading>
        <Text subtle>Your cart is safe. Give it a minute and try again.</Text>
        <Link href="/">Back to the aisles</Link>
      </Stack>
    </Center>
  )
}
