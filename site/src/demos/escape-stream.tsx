import { onCleanup, state } from '@weft-js/core'
import { Text } from '@weft-js/core/text'
import { Button, Card } from '@weft-js/warp'

const REPLY =
  'Streams arrive a few characters at a time. A plain element grows and reflows with every token, and the lines above can move. With stream, the height only grows and in whole lines.\n\nA finished paragraph is never rewritten, so only the last one changes while more text arrives.'

export default function Reply() {
  const text = state('')
  let timer: ReturnType<typeof setInterval> | undefined
  const send = () => {
    clearInterval(timer)
    text.value = ''
    let at = 0
    // Stands in for a model's answer: three characters every 30 ms.
    timer = setInterval(() => {
      at += 3
      text.value = REPLY.slice(0, at)
      if (at >= REPLY.length) clearInterval(timer)
    }, 30)
  }
  onCleanup(() => clearInterval(timer))
  return (
    <Card title="Streamed text">
      <Button size="sm" onClick={send}>
        Ask
      </Button>
      <Text stream>{text.value}</Text>
    </Card>
  )
}
