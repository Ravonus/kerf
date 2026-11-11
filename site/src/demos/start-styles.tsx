import { Button, Card, Text } from '@kerf-js/veneer'

export default function Special() {
  return (
    <Card
      eyebrow="Today only"
      title="Cardamom latte"
    >
      <Text role="title">$5.50</Text>
      <p
        style={{
          borderLeft:
            '4px solid var(--veneer-color-accent-solid)',
          paddingLeft: 'var(--veneer-space-related)',
          fontStyle: 'italic',
        }}
      >
        Until the oat milk runs out.
      </p>
      <Button tone="positive">Order one</Button>{' '}
      <Button
        emphasis="outline"
        tone="neutral"
      >
        Maybe later
      </Button>
    </Card>
  )
}
