import { Text } from '@kerf-js/veneer'

export const TextInline = () => (
  <Text>
    Uptime is{' '}
    <Text
      inline
      tone="positive"
    >
      99.98%
    </Text>{' '}
    this month,{' '}
    <Text
      inline
      subtle
    >
      up from 99.91%
    </Text>
    .
  </Text>
)
