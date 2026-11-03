import { derived, state } from '@weft-js/core'
import type { State } from '@weft-js/core'
import { AgentPlan, ArtifactPanel, Assistant, Badge, BranchSwitcher, Button, Checkpoint, Cite, ContextMeter, Conversation, MessageActions, ModelPicker, Prompt, Prose, Question, Reasoning, Row, Shimmer, Sources, SpeechInput, Stack, Suggestions, Text, ToolCall, TraceViewer, UserMessage, foldAnswer } from '@weft-js/warp'
import type { AgentEvent, AgentTool, Answer, PlanStep, PromptControl, PromptFile, QueuedMessage, Suggestion } from '@weft-js/warp'
import { copyConfirm } from '@weft-js/warp-core'
import { SparkleIcon } from '@weft-js/warp-icons'
import { COMMANDS, CONFIG_VERSIONS, CONTEXT, DEPLOY_SOURCES, MENTIONS, MODELS, ROLLBACK_ASK, ROLLBACK_DENIED, ROLLBACK_RUN, TRACE, WHY_FAILED } from '../world'

const QUESTION = 'Why did the mobile-bff deploy fail?'
const FINISHED = foldAnswer(WHY_FAILED)
const SHORT = foldAnswer([{ kind: 'text', text: 'Deploy `d-4819` failed its health check in ap-south.' }, { kind: 'done' }])
const CUT_OFF = foldAnswer([{ kind: 'text', text: 'Deploy `d-4819` failed its' }, { kind: 'done', stopped: true }])
const WAITING = foldAnswer([])
const CITED = DEPLOY_SOURCES.slice(1)

/** Plays a scripted run: in an app these events come from your stream. */
function play(answer: State<Answer>, events: AgentEvent[]) {
  let at = 0
  const next = () => {
    const event = events[at++]
    if (!event || answer.value.state === 'stopped') return
    answer.value = foldAnswer(answer.value, event)
    setTimeout(next, 450)
  }
  setTimeout(next, 450)
}

type Turn = { id: number; text: string; answer: State<Answer> }
const CHIPS = [{ title: 'Roll it back' }, { title: 'Show me the failing check' }]
const STARTERS = [
  { title: 'Why did my deploy fail?', description: 'Reads the last failed build' },
  { title: 'Roll back mobile-bff', description: 'Asks before it changes anything' },
  { title: 'What changed today?', description: 'Every deploy across your projects' },
  { title: 'Which project costs the most?', description: 'From this month\'s usage' },
]

/** The hub's card: one exchange, without the frame's title, which is sized for a whole pane. */
export const ConversationTile = () => (
  <Stack gap="related">
    <UserMessage text={QUESTION} />
    <Assistant answer={SHORT} quiet />
  </Stack>
)

export function ConversationDeployHelp() {
  const turns = state<Turn[]>([{ id: 1, text: QUESTION, answer: state(FINISHED) }])
  const last = () => turns.value[turns.value.length - 1]!.answer
  const busy = derived(() => ['waiting', 'streaming', 'approval'].includes(last().value.state))
  const send = (text: string) => {
    const answer = state(foldAnswer([]))
    turns.value = [...turns.value, { id: turns.value.length + 1, text, answer }]
    play(answer, ROLLBACK_ASK)
  }
  const stop = () => { last().value = foldAnswer(last().value, { kind: 'done', stopped: true }) }
  const again = (t: Turn) => { t.answer.value = foldAnswer([]); play(t.answer, WHY_FAILED) }
  return (
    <div style="block-size:620px">
      <Conversation title="mobile-bff deploy" prompt={
        <Prompt busy={busy.value} models={MODELS} model="swift" commands={COMMANDS} mentions={MENTIONS} context={CONTEXT} tools={['slash']} onSubmit={send} onStop={stop}>
          {!busy.value && <Suggestions items={CHIPS} variant="chips" style="margin:0 0 10px" onPick={s => send(s.title)} />}
        </Prompt>
      }>
        {turns.value.map(t => (
          <div key={t.id} style="display:contents">
            <UserMessage text={t.text} arrive={t.id > 1} />
            <Assistant n={t.id} quiet={t.id === 1} answer={t.answer.value} onApprove={() => play(t.answer, ROLLBACK_RUN)} onDeny={() => play(t.answer, ROLLBACK_DENIED)} onFeedback={() => {}} onRegenerate={() => again(t)} />
          </div>
        ))}
      </Conversation>
    </div>
  )
}

export function ConversationStarters() {
  const asked = state('')
  return (
    <div style="block-size:440px">
      <Conversation title="New chat" prompt={<Prompt tools={['slash']} commands={COMMANDS} onSubmit={text => (asked.value = text)} />}>
        {asked.value
          ? <UserMessage text={asked.value} arrive />
          : <Stack gap="group"><Text role="heading">What do you need?</Text><Suggestions items={STARTERS} onPick={s => (asked.value = s.title)} /></Stack>}
      </Conversation>
    </div>
  )
}

export const AssistantAnswer = () => <Assistant answer={FINISHED} n={1} quiet onFeedback={() => {}} onRegenerate={() => {}} />

export function AssistantApproval() {
  const answer = state(foldAnswer(ROLLBACK_ASK))
  const reset = () => (answer.value = foldAnswer(ROLLBACK_ASK))
  return (
    <Stack gap="related">
      <Assistant answer={answer.value} quiet onApprove={() => play(answer, ROLLBACK_RUN)} onDeny={() => play(answer, ROLLBACK_DENIED)} />
      {answer.value.state === 'done' && <Button emphasis="ghost" tone="neutral" size="sm" onClick={reset}>Start again</Button>}
    </Stack>
  )
}

export function AssistantFailed() {
  const answer = state(foldAnswer([{ kind: 'text', text: 'Reading the log for `d-4819`' }, { kind: 'error', message: 'The connection dropped.' }]))
  return <Assistant answer={answer.value} onRegenerate={() => { answer.value = foldAnswer([]); play(answer, [{ kind: 'text', text: 'Deploy `d-4819` failed its health check in ap-south.' }, { kind: 'done' }]) }} />
}

export const AssistantStopped = () => <Assistant answer={CUT_OFF} quiet />

export const AssistantWaiting = () => <Assistant answer={WAITING} />

export function UserMessageEditable() {
  const text = state('Roll back mobile-bff in every region')
  return <UserMessage text={text.value} onEdit={next => (text.value = next)} />
}

export const UserMessageLong = () => <UserMessage text="Compare d-4819 with the last good deploy of mobile-bff. Tell me what changed, whether the change explains the failed check, and what you would do next." />

const VERSIONS = [
  'Lower `attempts` to 2 and redeploy. The old value passed every check.',
  'Roll back to `d-4801` first, then fix the retry settings on a branch.',
  'Keep five attempts, but stop retrying once a request has taken 3 seconds.',
]

export function BranchSwitcherVersions() {
  const at = state(1)
  return (
    <Stack gap="related">
      <Prose text={VERSIONS[at.value]!} />
      <Row gap="related">
        <Text role="caption" subtle>Regenerated twice</Text>
        <BranchSwitcher index={at.value} count={VERSIONS.length} onChange={i => (at.value = i)} />
      </Row>
    </Stack>
  )
}

export function MessageActionsFeedback() {
  const said = state('Nothing yet')
  return (
    <Stack gap="related">
      <Prose text="Rollback finished. `mobile-bff` is back on `d-4801`." />
      <MessageActions
        onCopy={el => { void copyConfirm(el, 'Rollback finished.'); said.value = 'Copied' }}
        onFeedback={(value, reason) => (said.value = reason ?? (value ? `Rated ${value}` : 'Rating cleared'))}
        onRegenerate={() => (said.value = 'Regenerating')}
        onBranch={() => (said.value = 'New branch')}
      />
      <Text role="caption" subtle>Last action: {said.value}</Text>
    </Stack>
  )
}

export const MessageActionsStopped = () => <MessageActions stopped onCopy={() => {}} />

export const ReasoningThinking = () => <Reasoning streaming text="The build passed, so the failure is in the health check. I'll read which check failed and in which region." />

export const ReasoningFinished = () => <Reasoning seconds={4} text="The build passed, so the failure is in the health check. The log shows ap-south timing out three times in a row." />

const ARGS = '{ "deploy": "d-4819" }'

export const ToolCallStates = () => (
  <Stack gap="related">
    <ToolCall call={{ id: 'a', name: 'read_logs', args: ARGS, state: 'running' }} />
    <ToolCall call={{ id: 'b', name: 'compare_deploys', args: '{ "from": "d-4801", "to": "d-4819" }', state: 'done', ms: 410, output: '1 file changed\nsrc/retry.ts: attempts 2 → 5' }} />
    <ToolCall call={{ id: 'c', name: 'run_checks', args: ARGS, state: 'failed', exit: 1, output: '1 failed · ap-south · upstream timed out' }} />
    <ToolCall call={{ id: 'd', name: 'delete_branch', args: '{ "name": "retry-spike" }', state: 'denied' }} />
  </Stack>
)

const ROLLBACK: AgentTool = { id: 'rollback', name: 'rollback', args: '{\n  "project": "mobile-bff",\n  "to": "d-4801"\n}', state: 'approval' }

export function ToolCallApproval() {
  const call = state(ROLLBACK)
  const approve = (args: string) => {
    call.value = { ...call.value, args, state: 'running' }
    setTimeout(() => { call.value = { ...call.value, state: 'done', ms: 1400, output: 'mobile-bff is on d-4801' } }, 1400)
  }
  return (
    <Stack gap="related">
      <ToolCall call={call.value} quiet alwaysAllow="Always allow rollbacks on mobile-bff" onApprove={approve} onDeny={() => (call.value = { ...call.value, state: 'denied' })} />
      {call.value.state !== 'approval' && <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => (call.value = ROLLBACK)}>Ask again</Button>}
    </Stack>
  )
}

export const CiteInline = () => (
  <Stack gap="group">
    <Text>
      The deploy was held back after three failed checks <Cite n={1} source={DEPLOY_SOURCES[1]} href="#cite-s1" />, and the cause is one retry setting <Cite n={2} source={DEPLOY_SOURCES[2]} href="#cite-s2" />.
    </Text>
    <Sources items={CITED} base="cite" />
  </Stack>
)

export const SourcesDeploy = () => <Sources items={DEPLOY_SOURCES} base="deploy" />

const REPORT = 'Three failed checks held the deploy back [1].\n\n- `d-4801` is still live.\n- Lower `attempts` to 2 and redeploy.\n\n```Shell\nweft deploy mobile-bff --branch main\n```\n'

export const ProseAnswer = () => (
  <div data-scope="assistant">
    <span data-part="mark"><SparkleIcon /></span>
    <div data-part="content"><Prose text={REPORT} sources={CITED} base="report" /></div>
  </div>
)

const STEPS: PlanStep[] = [
  { id: 'logs', title: 'Read the build log', state: 'done' },
  { id: 'check', title: 'Check that d-4801 is healthy', state: 'running' },
  { id: 'roll', title: 'Roll back ap-south', state: 'pending' },
  { id: 'watch', title: 'Watch the health checks for 5 minutes', state: 'pending' },
]

const advance = (steps: PlanStep[]) => {
  const at = steps.findIndex(s => s.state === 'running')
  return steps.map((s, i): PlanStep => (i === at ? { ...s, state: 'done' } : i === at + 1 ? { ...s, state: 'running' } : s))
}

export function AgentPlanRollback() {
  const steps = state(STEPS)
  const queue = state<QueuedMessage[]>([{ id: 'q1', text: 'Post a note in #incidents when it is done' }, { id: 'q2', text: 'Then open a fix branch' }])
  return (
    <Stack gap="related">
      <AgentPlan title="Rollback" steps={steps.value} queue={queue.value} onRemoveQueued={id => (queue.value = queue.value.filter(q => q.id !== id))} />
      <Row gap="related">
        <Button emphasis="outline" tone="neutral" size="sm" onClick={() => (steps.value = advance(steps.value))}>Finish this step</Button>
        <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => (steps.value = STEPS)}>Reset</Button>
      </Row>
    </Stack>
  )
}

export const AgentPlanBlocked = () => (
  <AgentPlan steps={[{ id: 'a', title: 'Check that d-4801 is healthy', state: 'done' }, { id: 'b', title: 'Roll back ap-south', state: 'blocked' }, { id: 'c', title: 'Watch the health checks', state: 'pending' }]} />
)

export function PromptComposer() {
  const sent = state('')
  const files = state<PromptFile[]>([])
  const web = state(false)
  return (
    <Stack gap="related">
      <Text role="caption" subtle>{sent.value ? `Sent: ${sent.value}` : 'Type / for commands or @ for people.'}</Text>
      <Prompt
        placeholder="Ask about a deploy"
        tools={['attach', 'slash', 'web']}
        models={MODELS}
        model="swift"
        commands={COMMANDS}
        mentions={MENTIONS}
        context={CONTEXT}
        files={files.value}
        web={web.value}
        onWebChange={on => (web.value = on)}
        onAttach={list => (files.value = [...files.value, ...list.map(f => ({ id: f.name, name: f.name }))])}
        onRemoveFile={id => (files.value = files.value.filter(f => f.id !== id))}
        onSubmit={text => (sent.value = text)}
      />
    </Stack>
  )
}

export function PromptBusy() {
  const busy = state(true)
  const queue = state<string[]>([])
  return (
    <Stack gap="related">
      <Text role="caption" subtle>{busy.value ? 'Running. Messages wait in line.' : 'Stopped.'} {queue.value.length} queued.</Text>
      <Prompt busy={busy.value} tools={[]} onStop={() => (busy.value = false)} onSubmit={() => (busy.value = true)} onQueue={text => (queue.value = [...queue.value, text])} />
    </Stack>
  )
}

export const PromptBlocked = () => <Prompt blocked="You're offline" value="Roll back mobile-bff" tools={[]} />

export const PromptUploading = () => <Prompt value="What does this log say?" tools={['attach']} files={[{ id: 'log', name: 'd-4819-build.log', progress: 0.6 }]} />

export function ModelPickerChoose() {
  const model = state('swift')
  return (
    <Stack gap="related" align="center">
      <ModelPicker models={MODELS} value={model} />
      <Text role="caption" subtle>Answers will use {MODELS.find(m => m.id === model.value)?.name}</Text>
    </Stack>
  )
}

export function SuggestionsStarters() {
  const picked = state<Suggestion | null>(null)
  return (
    <Stack gap="related">
      <Suggestions items={STARTERS} onPick={s => (picked.value = s)} />
      <Text role="caption" subtle>{picked.value ? `Sends: ${picked.value.title}` : 'Pick one to send it.'}</Text>
    </Stack>
  )
}

export const SuggestionsChips = () => <Suggestions items={CHIPS} variant="chips" />

const GAP = { id: 'scope', prompt: 'Which regions should go back to d-4801?', options: ['Only ap-south', 'Every region'], free: true }

export function QuestionPickScope() {
  const question = state<typeof GAP & { answer?: string | string[] }>(GAP)
  return <Question question={question.value} quiet onAnswer={answer => (question.value = { ...GAP, answer })} />
}

const NOTIFY = { id: 'who', prompt: 'Who should hear about the rollback?', options: ['#incidents', 'The on-call engineer', 'Everyone watching mobile-bff'], multiple: true }

export function QuestionManyAnswers() {
  const question = state<typeof NOTIFY & { answer?: string | string[] }>(NOTIFY)
  return <Question question={question.value} quiet onAnswer={answer => (question.value = { ...NOTIFY, answer })} />
}

export const QuestionClosed = () => <Question question={{ ...GAP, closed: true }} quiet />

export function CheckpointRestore() {
  const restored = state(false)
  return (
    <Stack gap="related">
      <Text>Lowered <code>attempts</code> to 2.</Text>
      <Checkpoint label="Before the retry change" onRestore={() => (restored.value = true)} />
      {restored.value ? <Text subtle>Restored. The chat continues on a new branch from here.</Text> : <Text>Redeployed <code>mobile-bff</code>.</Text>}
    </Stack>
  )
}

export const ShimmerLoading = () => (
  <Stack gap="related">
    <Shimmer>Reading 214 log lines…</Shimmer>
    <Shimmer>Comparing d-4801 with d-4819…</Shimmer>
  </Stack>
)

export const ContextMeterLevels = () => (
  <>
    <ContextMeter used={64000} limit={200000} showTokens />
    <ContextMeter used={168000} limit={200000} showTokens />
    <ContextMeter used={194000} limit={200000} showTokens />
  </>
)

export function ContextMeterCompact() {
  const used = state(186000)
  return <ContextMeter used={used.value} limit={200000} parts={CONTEXT.parts} showTokens onCompact={() => (used.value = 38000)} />
}

export const TraceViewerRun = () => <TraceViewer spans={TRACE} label="Last answer" />

export const ArtifactPanelConfig = () => (
  <div style="block-size:280px">
    <ArtifactPanel title="weft.yaml" versions={CONFIG_VERSIONS}>
      <Stack gap="related">
        <Row gap="related"><Text role="label">mobile-bff</Text><Badge tone="info">ap-south</Badge></Row>
        <Text subtle>Two attempts, three seconds each. A slow upstream now fails in six seconds, not fifteen.</Text>
      </Stack>
    </ArtifactPanel>
  </div>
)

const MICS = [{ value: 'mbp', label: 'MacBook Pro Microphone' }, { value: 'pods', label: 'AirPods Pro' }]
const WORDS = ['Roll back', 'Roll back mobile-bff', 'Roll back mobile-bff in ap-south']

/** A stand-in for the browser's speech recognition: nothing touches the microphone. */
const fakeEngine = (on: Parameters<NonNullable<Parameters<typeof SpeechInput>[0]['engine']>>[0]) => {
  let timer: ReturnType<typeof setInterval>
  return {
    start() {
      let i = 0
      on.onState('listening')
      timer = setInterval(() => {
        if (i < WORDS.length) { on.onTranscript(i ? WORDS[i - 1]! : '', WORDS[i]!.slice(i ? WORDS[i - 1]!.length : 0)); on.onLevel(0.3 + (i % 2) * 0.4); i++ }
        else { on.onTranscript(WORDS[WORDS.length - 1]!, ''); clearInterval(timer); on.onState('idle') }
      }, 800)
    },
    stop() { clearInterval(timer); on.onState('idle') },
  }
}

export function SpeechInputDictate() {
  let prompt: PromptControl | undefined
  return (
    <Stack gap="group">
      <SpeechInput mics={MICS} engine={fakeEngine} onInsert={text => prompt?.insert(text)} />
      <Prompt tools={[]} control={c => (prompt = c)} placeholder="Your dictation lands here" />
    </Stack>
  )
}

export const SpeechInputTranscript = () => <SpeechInput mics={MICS} engine={fakeEngine} initial={{ final: 'Show me the failing', interim: 'check' }} />
