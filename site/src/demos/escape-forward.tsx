import { Button, Card } from '@kerf/veneer'

// A component that hands its input to whoever renders it,
// through a `ref` prop that is a function.
function NameField({
  label,
  ref,
}: {
  label: string
  ref?: ((el: HTMLInputElement) => void) | undefined
}) {
  return (
    <label>
      {label} <input ref={ref} />
    </label>
  )
}

export default function Form() {
  let input: HTMLInputElement | undefined
  return (
    <Card title="A ref through a component">
      <NameField
        label="Name"
        ref={(el) => (input = el)}
      />
      <Button
        size="sm"
        onClick={() => input?.focus()}
      >
        Focus the name
      </Button>
    </Card>
  )
}
