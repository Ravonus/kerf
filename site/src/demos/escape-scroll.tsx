import { Button, Card, Row } from '@weft-js/warp'

const CATS = ['Tom', 'Maru', 'Jellylorum', 'Mog', 'Grumpy', 'Orlando', 'Bustopher', 'Skimbleshanks']

export default function Cats() {
  // One element per name. The ref function runs once per row, when the row's element is made.
  const rows = new Map<string, HTMLElement>()
  const show = (name: string) =>
    rows.get(name)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  return (
    <Card title="Scroll to a cat">
      <Row gap="tight" wrap>
        <Button size="sm" onClick={() => show('Tom')}>
          Tom
        </Button>
        <Button size="sm" emphasis="soft" onClick={() => show('Orlando')}>
          Orlando
        </Button>
        <Button size="sm" emphasis="soft" onClick={() => show('Skimbleshanks')}>
          Skimbleshanks
        </Button>
      </Row>
      <ol style="max-block-size:7rem;overflow:auto">
        {CATS.map((name) => (
          <li key={name} ref={(el: HTMLElement) => rows.set(name, el)}>
            {name}
          </li>
        ))}
      </ol>
    </Card>
  )
}
