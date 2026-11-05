import { state } from '@weft-js/core'
import { Button, Card, Stack } from '@weft-js/warp'

// A wrapper: `tone` has a default, `children` is what
// goes between the tags, and the rest lands on the
// <section>.
function Panel({
  title,
  tone = 'plain',
  children,
  ...rest
}: {
  title: string
  tone?: 'plain' | 'warn'
  children?: unknown
  [attr: string]: unknown
}) {
  return (
    <section
      {...rest}
      style={{
        padding: 'var(--warp-space-related)',
        borderRadius: 'var(--warp-radius-control)',
        border: '1px solid var(--warp-color-border)',
        borderColor:
          tone === 'warn'
            ? 'var(--warp-color-caution-border)'
            : undefined,
      }}
    >
      <strong>{title}</strong>
      <div>{children}</div>
    </section>
  )
}

export default function Panels() {
  const stock = state(3)
  const sell = () => {
    stock.value = stock.value > 0 ? stock.value - 1 : 3
  }
  return (
    <Card title="Two panels">
      <Stack gap="related">
        <Panel
          title="Beans"
          aria-label="Beans in stock"
        >
          {stock.value} bags left
        </Panel>
        <Panel
          title="Milk"
          tone={stock.value < 2 ? 'warn' : 'plain'}
          data-low={stock.value < 2}
        >
          Order more when the beans run low.
        </Panel>
        <Button onClick={sell}>Sell a bag</Button>
      </Stack>
    </Card>
  )
}
