import { Card } from '@weft-js/warp'

function Greeting(props: {
  name: string
  visits: number
}) {
  const { name, visits } = props
  return (
    <p>
      Hello, <strong>{name}</strong>.{' '}
      {visits > 1
        ? `Visit ${visits}.`
        : 'First visit.'}
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
