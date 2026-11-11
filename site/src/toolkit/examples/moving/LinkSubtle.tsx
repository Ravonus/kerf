import { Link, Text } from '@kerf-js/veneer'

export const LinkSubtle = () => (
  <Text subtle>
    Questions?{' '}
    <Link
      subtle
      href="/toolkit"
    >
      Read the guide
    </Link>{' '}
    or ask your team's owner.
  </Text>
)
