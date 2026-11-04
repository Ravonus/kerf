import { Button, Card, Row } from '@weft-js/warp'

export default function Focus() {
  // The compiler assigns the element to `field` when the input is made, so nothing here assigns it.
  // oxlint-disable-next-line no-unassigned-vars -- the compiler assigns it through ref
  let field!: HTMLInputElement
  return (
    <Card title="Focus and select">
      <input ref={field} aria-label="Your name" value="Ada Lovelace" />
      <Row gap="tight">
        <Button size="sm" onClick={() => field.focus()}>
          Focus
        </Button>
        <Button size="sm" emphasis="outline" onClick={() => field.select()}>
          Select all
        </Button>
        <Button size="sm" emphasis="ghost" onClick={() => field.blur()}>
          Blur
        </Button>
      </Row>
    </Card>
  )
}
