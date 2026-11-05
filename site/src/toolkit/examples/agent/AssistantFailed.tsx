import { state } from '@weft-js/core'
import { Assistant, foldAnswer } from '@weft-js/warp'
import { play } from './shared'

export function AssistantFailed() {
  const answer = state(
    foldAnswer([
      {
        kind: 'text',
        text: 'Reading the log for `d-4819`',
      },
      {
        kind: 'error',
        message: 'The connection dropped.',
      },
    ]),
  )
  const regenerate = () => {
    answer.value = foldAnswer([])
    play(answer, [
      {
        kind: 'text',
        text:
          'Deploy `d-4819` failed its health ' +
          'check in ap-south.',
      },
      { kind: 'done' },
    ])
  }
  return (
    <Assistant
      answer={answer.value}
      onRegenerate={regenerate}
    />
  )
}
