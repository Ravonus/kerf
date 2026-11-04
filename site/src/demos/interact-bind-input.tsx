import { state } from '@weft-js/core'
import { Button, Card, Input } from '@weft-js/warp'

// A field that edits its own value. It doesn't know or care whether anyone above is listening.
function NameField(props: { label: string; value?: string }) {
  let { value = '' } = props
  return (
    <Input label={props.label} value={value} onInput={(e) => (value = e.currentTarget.value)} />
  )
}

export default function Signup() {
  const first = state('Ada')
  const last = state('Lovelace')
  return (
    <Card title="Two bound fields, one that isn't">
      <NameField label="First name" bind:value={first} />
      <NameField label="Last name" bind:value={last} />
      <NameField label="Nickname (not bound)" value={first.value} />
      <p>
        Hello, {first.value} {last.value}
      </p>
      <Button
        size="sm"
        emphasis="ghost"
        onClick={() => {
          first.value = ''
          last.value = ''
        }}
      >
        Clear
      </Button>
    </Card>
  )
}
