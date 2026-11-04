import { state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

// The toolbar knows nothing about playing or uploading: whoever uses it passes what each button does.
function Toolbar(props: { onPlay: () => void; onUpload: () => void }) {
  return (
    <p>
      <Button size="sm" onClick={props.onPlay}>
        Play movie
      </Button>
      <Button size="sm" emphasis="outline" onClick={props.onUpload}>
        Upload image
      </Button>
    </p>
  )
}

export default function App() {
  const said = state('Nothing yet')
  return (
    <Card title="A toolbar">
      <Toolbar
        onPlay={() => (said.value = 'Playing Kiki’s Delivery Service')}
        onUpload={() => (said.value = 'Uploading…')}
      />
      <p>{said.value}</p>
    </Card>
  )
}
