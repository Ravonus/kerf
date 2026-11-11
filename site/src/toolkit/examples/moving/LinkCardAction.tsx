import { Card, Link, Text } from '@kerf-js/veneer'

export const LinkCardAction = () => (
  <Card
    eyebrow="Failed"
    title="mobile-bff deploy d-4819"
  >
    <Text subtle>
      Retry timed out upstream calls, by Sam Okafor.
    </Text>
    <Link href="/toolkit/alert">
      {'See what went wrong'}
    </Link>
  </Card>
)
