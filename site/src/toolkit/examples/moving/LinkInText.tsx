import { Link, Text } from '@kerf/veneer'

export const LinkInText = () => (
  <Text>
    Roll back from the{' '}
    <Link href="/toolkit/table">deploys table</Link>.
    Traffic moves in about ten seconds.
  </Text>
)
