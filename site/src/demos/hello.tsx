import { Card } from '@weft-js/warp'

function Greeting(props: { name: string; visits: number }) {
  return (
    <p>
      Hello, <strong>{props.name}</strong>.{' '}
      {props.visits > 1 ? `Visit ${props.visits}.` : 'First visit.'}
    </p>
  )
}

export default function Welcome() {
  return (
    <Card title="Two greetings">
      <Greeting name="Ana" visits={1} />
      <Greeting name="Ben" visits={4} />
    </Card>
  )
}
