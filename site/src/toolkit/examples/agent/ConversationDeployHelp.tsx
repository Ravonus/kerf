import { derived, state } from '@weft-js/core'
import type { State } from '@weft-js/core'
import {
  Assistant,
  Conversation,
  Prompt,
  Suggestions,
  UserMessage,
  foldAnswer,
} from '@weft-js/warp'
import {
  COMMANDS,
  CONTEXT,
  MENTIONS,
  MODELS,
  ROLLBACK_ASK,
  ROLLBACK_DENIED,
  ROLLBACK_RUN,
  WHY_FAILED,
} from '../../world'
import { QUESTION, FINISHED, play, CHIPS } from './shared'
import type { Turn } from './shared'

export function ConversationDeployHelp() {
  const turns = state<Turn[]>([
    { id: 1, text: QUESTION, answer: state(FINISHED) },
  ])
  const last = () =>
    turns.value[turns.value.length - 1]!.answer
  const busy = derived(() =>
    ['waiting', 'streaming', 'approval'].includes(
      last().value.state,
    ),
  )
  const send = createSender(turns)
  const stop = () => {
    last().value = foldAnswer(last().value, {
      kind: 'done',
      stopped: true,
    })
  }
  const again = (t: Turn) => {
    t.answer.value = foldAnswer([])
    play(t.answer, WHY_FAILED)
  }
  return (
    <div style="block-size:620px">
      <Conversation
        title="mobile-bff deploy"
        prompt={
          <Prompt
            busy={busy.value}
            models={MODELS}
            model="swift"
            commands={COMMANDS}
            mentions={MENTIONS}
            context={CONTEXT}
            tools={['slash']}
            onSubmit={send}
            onStop={stop}
          >
            {!busy.value && (
              <Suggestions
                items={CHIPS}
                variant="chips"
                style="margin:0 0 10px"
                onPick={(s) => send(s.title)}
              />
            )}
          </Prompt>
        }
      >
        {turns.value.map((t) => (
          <div
            key={t.id}
            style="display:contents"
          >
            <UserMessage
              text={t.text}
              arrive={t.id > 1}
            />
            <Assistant
              n={t.id}
              quiet={t.id === 1}
              answer={t.answer.value}
              onApprove={() =>
                play(t.answer, ROLLBACK_RUN)
              }
              onDeny={() =>
                play(t.answer, ROLLBACK_DENIED)
              }
              onFeedback={() => {}}
              onRegenerate={() => again(t)}
            />
          </div>
        ))}
      </Conversation>
    </div>
  )
}

function createSender(turns: State<Turn[]>) {
  return (text: string) => {
    const answer = state(foldAnswer([]))
    turns.value = [
      ...turns.value,
      { id: turns.value.length + 1, text, answer },
    ]
    play(answer, ROLLBACK_ASK)
  }
}
