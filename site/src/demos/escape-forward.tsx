import { Button, Card } from '@weft-js/warp'

// A component that hands its input to whoever renders it, through a `ref` prop that is a function.
function NameField(props: { label: string; ref?: ((el: HTMLInputElement) => void) | undefined }) {
  return (
    <label>
      {props.label} <input ref={props.ref} />
    </label>
  )
}

export default function Form() {
  let input: HTMLInputElement | undefined
  return (
    <Card title="A ref through a component">
      <NameField label="Name" ref={(el) => (input = el)} />
      <Button size="sm" onClick={() => input?.focus()}>
        Focus the name
      </Button>
    </Card>
  )
}
