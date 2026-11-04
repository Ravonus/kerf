import { state } from '@weft-js/core'
import { Badge, Button, Card, Input, Row, Segmented, Stack } from '@weft-js/warp'

type Theme = 'light' | 'dark'
type Expression = 'quiet' | 'balanced' | 'vivid'
type Density = 'compact' | 'cozy' | 'comfortable'

const THEMES = [
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
]
const EXPRESSIONS = [
  { value: 'quiet' as const, label: 'Quiet' },
  { value: 'balanced' as const, label: 'Balanced' },
  { value: 'vivid' as const, label: 'Vivid' },
]
const DENSITIES = [
  { value: 'compact' as const, label: 'Compact' },
  { value: 'cozy' as const, label: 'Cozy' },
  { value: 'comfortable' as const, label: 'Comfortable' },
]

export default function Dials() {
  const theme = state<Theme>('dark')
  const expression = state<Expression>('balanced')
  const density = state<Density>('cozy')
  return (
    <Stack gap="related">
      <Segmented
        label="Theme"
        value={theme.value}
        options={THEMES}
        onChange={(next) => (theme.value = next)}
      />
      <Segmented
        label="Expression"
        value={expression.value}
        options={EXPRESSIONS}
        onChange={(next) => (expression.value = next)}
      />
      <Segmented
        label="Density"
        value={density.value}
        options={DENSITIES}
        onChange={(next) => (density.value = next)}
      />
      {/* The dials are data attributes. Everything inside this div reads its tokens from them. */}
      <div data-theme={theme.value} data-expression={expression.value} data-density={density.value}>
        <Card eyebrow="Coffee" title="House blend, 250 g">
          <Stack gap="related">
            <Input label="Gift note" />
            <Row gap="tight" justify="between">
              <Badge tone="positive">In stock</Badge>
              <Button>Add to cart</Button>
            </Row>
          </Stack>
        </Card>
      </div>
    </Stack>
  )
}
