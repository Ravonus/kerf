import type { State } from '@kerf/core'
import { foldAnswer } from '@kerf/veneer'
import type {
  AgentEvent,
  AgentTool,
  Answer,
  PlanStep,
  SpeechInputProps,
} from '@kerf/veneer'
import { DEPLOY_SOURCES, WHY_FAILED } from '../../world'

export const QUESTION =
  'Why did the mobile-bff deploy fail?'

export const FINISHED = foldAnswer(WHY_FAILED)

export const SHORT = foldAnswer([
  {
    kind: 'text',
    text:
      'Deploy `d-4819` failed its health ' +
      'check in ap-south.',
  },
  { kind: 'done' },
])

export const CUT_OFF = foldAnswer([
  { kind: 'text', text: 'Deploy `d-4819` failed its' },
  { kind: 'done', stopped: true },
])

export const WAITING = foldAnswer([])

export const CITED = DEPLOY_SOURCES.slice(1)

/** Plays a scripted run: in an app these events come
 * from your stream. */
export function play(
  answer: State<Answer>,
  events: AgentEvent[],
) {
  let at = 0
  const next = () => {
    const event = events[at++]
    if (!event || answer.value.state === 'stopped') return
    answer.value = foldAnswer(answer.value, event)
    setTimeout(next, 450)
  }
  setTimeout(next, 450)
}

export type Turn = {
  id: number
  text: string
  answer: State<Answer>
}

export const CHIPS = [
  { title: 'Roll it back' },
  { title: 'Show me the failing check' },
]

export const STARTERS = [
  {
    title: 'Why did my deploy fail?',
    description: 'Reads the last failed build',
  },
  {
    title: 'Roll back mobile-bff',
    description: 'Asks before it changes anything',
  },
  {
    title: 'What changed today?',
    description: 'Every deploy across your projects',
  },
  {
    title: 'Which project costs the most?',
    description: "From this month's usage",
  },
]

export const VERSIONS = [
  'Lower `attempts` to 2 and ' +
    'redeploy. The old value passed ' +
    'every check.',
  'Roll back to `d-4801` first, then ' +
    'fix the retry settings on a ' +
    'branch.',
  'Keep five attempts, but stop ' +
    'retrying once a request has taken ' +
    '3 seconds.',
]

export const ARGS = '{ "deploy": "d-4819" }'

export const ROLLBACK: AgentTool = {
  id: 'rollback',
  name: 'rollback',
  args:
    '{\n  "project": "mobile-bff",\n  ' +
    '"to": "d-4801"\n}',
  state: 'approval',
}

export const REPORT =
  'Three failed checks held the ' +
  'deploy back [1].\n\n- `d-4801` is ' +
  'still live.\n- Lower `attempts` to ' +
  '2 and redeploy.\n\n```Shell\nkerf ' +
  'deploy mobile-bff --branch main\n' +
  '```\n'

export const STEPS: PlanStep[] = [
  {
    id: 'logs',
    title: 'Read the build log',
    state: 'done',
  },
  {
    id: 'check',
    title: 'Check that d-4801 is healthy',
    state: 'running',
  },
  {
    id: 'roll',
    title: 'Roll back ap-south',
    state: 'pending',
  },
  {
    id: 'watch',
    title: 'Watch the health checks for 5 minutes',
    state: 'pending',
  },
]

export const advance = (steps: PlanStep[]) => {
  const at = steps.findIndex((s) => s.state === 'running')
  return steps.map((s, i): PlanStep =>
    i === at
      ? { ...s, state: 'done' }
      : i === at + 1
        ? { ...s, state: 'running' }
        : s,
  )
}

export const GAP = {
  id: 'scope',
  prompt: 'Which regions should go back to d-4801?',
  options: ['Only ap-south', 'Every region'],
  free: true,
}

export const NOTIFY = {
  id: 'who',
  prompt: 'Who should hear about the rollback?',
  options: [
    '#incidents',
    'The on-call engineer',
    'Everyone watching mobile-bff',
  ],
  multiple: true,
}

export const MICS = [
  { value: 'mbp', label: 'MacBook Pro Microphone' },
  { value: 'pods', label: 'AirPods Pro' },
]

export const WORDS = [
  'Roll back',
  'Roll back mobile-bff',
  'Roll back mobile-bff in ap-south',
]

/** A stand-in for the browser's speech recognition:
 * nothing touches the microphone. */
export const fakeEngine = (
  on: Parameters<
    NonNullable<SpeechInputProps['engine']>
  >[0],
) => {
  let timer: ReturnType<typeof setInterval>
  return {
    start() {
      let i = 0
      on.onState('listening')
      timer = setInterval(() => {
        if (i < WORDS.length) {
          on.onTranscript(
            i ? WORDS[i - 1]! : '',
            WORDS[i]!.slice(i ? WORDS[i - 1]!.length : 0),
          )
          on.onLevel(0.3 + (i % 2) * 0.4)
          i++
        } else {
          on.onTranscript(WORDS[WORDS.length - 1]!, '')
          clearInterval(timer)
          on.onState('idle')
        }
      }, 800)
    },
    stop() {
      clearInterval(timer)
      on.onState('idle')
    },
  }
}
