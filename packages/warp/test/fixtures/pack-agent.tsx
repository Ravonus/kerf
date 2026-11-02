// The agent pack on one page (?part=agent), with the specimen's sample data. `XCase` exports are what agent-hydrate
// renders. Imports are per file: the ssr and hydrate query imports follow .tsx only.
import { foldAnswer, type AgentEvent, type Answer, type TraceSpan } from '@weft-js/warp-core'
import { state } from '@weft-js/core'
import { Button } from '../../src/Button'
import { Tabs } from '../../src/Tabs'
import { Toaster } from '../../src/Toast'
import { MessageActions } from '../../src/agent/Actions'
import { AgentPlan, type QueuedMessage } from '../../src/agent/AgentPlan'
import { ArtifactPanel } from '../../src/agent/ArtifactPanel'
import { Assistant } from '../../src/agent/Assistant'
import { Checkpoint } from '../../src/agent/Checkpoint'
import { ContextMeter } from '../../src/agent/ContextMeter'
import { Conversation } from '../../src/agent/Conversation'
import { Message } from '../../src/agent/Message'
import type { ModelOption } from '../../src/agent/ModelPicker'
import { Prompt, type PromptControl, type PromptFile } from '../../src/agent/Prompt'
import { Question } from '../../src/agent/Question'
import { Reasoning } from '../../src/agent/Reasoning'
import { Shimmer } from '../../src/agent/Shimmer'
import { SpeechInput } from '../../src/agent/SpeechInput'
import { Suggestions } from '../../src/agent/Suggestions'
import { ToolCall } from '../../src/agent/ToolCall'
import { TraceViewer } from '../../src/agent/TraceViewer'

const EDIT_ARGS = '{\n  "path": "src/calendar/rrule.ts",\n  "lines": "41-52",\n  "replace": "step by { weeks: 1 } on ZonedDateTime"\n}'
export const events: AgentEvent[] = [
  { kind: 'plan', steps: [{ id: 'find', title: 'Find where recurrences expand', state: 'done' }, { id: 'patch', title: 'Patch expansion to zoned wall time', state: 'running' }, { id: 'test', title: 'Run the calendar tests', state: 'pending' }, { id: 'sum', title: 'Summarize the change', state: 'pending' }] },
  { kind: 'reasoning', at: 0, text: 'Events shift by exactly one hour after the clocks change. That points at the recurrence being expanded in UTC rather than in the event\'s own zone.' },
  { kind: 'tool', id: 'search', name: 'search_code', args: '{ "query": "expandRecurrence", "path": "src/calendar" }', at: 4000 },
  { kind: 'tool-result', id: 'search', output: '2 matches\nsrc/calendar/rrule.ts:41  export function* expandRecurrence(…)', ms: 640 },
  { kind: 'text', text: 'The shift comes from expanding the rule in UTC. `expandRecurrence` adds 7 × 24 hours to each instance, so after the clocks change on Nov 1 every later instance lands an hour off in New York [1]. A weekly rule is defined in wall time, so it has to be stepped in the event\'s own zone [2].\n\n```TypeScript\nlet at = Temporal.ZonedDateTime.from(ev.start)\nat = at.add({ weeks: 1 }) // a wall-clock week: DST-safe\n```\n' },
  { kind: 'source', title: 'rrule.ts', path: 'src/calendar · L41–52', snippet: 'export function* expandRecurrence(ev, until)' },
  { kind: 'source', title: 'Recurrence rules', path: 'RFC 5545 · §3.3.10', snippet: 'A rule recurs in the local time of its DTSTART.', url: 'https://www.rfc-editor.org/rfc/rfc5545' },
]
const finished: AgentEvent[] = [...events,
  { kind: 'tool', id: 'tests', name: 'run_tests', args: '{ "filter": "calendar" }' },
  { kind: 'tool-result', id: 'tests', output: '38 passed · 0 failed · 1.9 s', ms: 1900 },
  { kind: 'text', text: '\n- Weekly standup now stays at 9:00 on both sides of Nov 1.\n- Added a test for the fall-back week.\n' },
  { kind: 'done' },
]
const approving: AgentEvent[] = [...events, { kind: 'approval', id: 'edit', name: 'edit_file', args: EDIT_ARGS }, { kind: 'plan', id: 'patch', state: 'blocked' }]
const asking: AgentEvent[] = [{ kind: 'text', text: 'Temporal can resolve it three ways, and that choice is yours:' }, { kind: 'question', id: 'gap', prompt: 'What should happen to an instance that falls in the gap?', options: ['Move it forward to 3:30 AM (recommended)', 'Skip that one instance', 'Keep 2:30 and flag it for the organizer'], free: true }]
const stopped: AgentEvent[] = [{ kind: 'text', text: 'The shift comes from' }, { kind: 'tool', id: 'x', name: 'fetch_url', args: '{ }' }, { kind: 'done', stopped: true }]
const failed: AgentEvent[] = [{ kind: 'text', text: 'Reading the rule' }, { kind: 'error', message: 'The connection dropped.' }]
const answers = { none: foldAnswer([]), finished: foldAnswer(finished), approving: foldAnswer(approving), asking: foldAnswer(asking), stopped: foldAnswer(stopped), failed: foldAnswer(failed) }

export const MODELS: ModelOption[] = [
  { id: 'lg', name: 'Large', short: 'Lg', provider: 'Anthropic', description: 'Best for multi-step agent work', capabilities: ['tools', 'vision'], context: '200k', cost: '$$$' },
  { id: 'md', name: 'Medium', short: 'Md', provider: 'Anthropic', description: 'Fast, strong at code', capabilities: ['tools'], context: '200k', cost: '$$' },
  { id: 'sm', name: 'Small', short: 'Sm', provider: 'Local', description: 'Quick answers, lowest cost', context: '128k', cost: '$' },
]
const COMMANDS = [{ value: '/plan', description: 'Draft a plan before acting' }, { value: '/search', description: 'Search the codebase' }, { value: '/test', description: 'Run the test suite' }, { value: '/compact', description: 'Summarize to free context' }]
const MENTIONS = [{ value: '@ana', description: 'Ana Ruiz' }, { value: '@kofi', description: 'Kofi Mensah' }]
const CONTEXT = { used: 46000, limit: 200000, parts: [{ label: 'Prompt', tokens: 2000 }, { label: 'Tools', tokens: 8000 }, { label: 'Files', tokens: 16000 }, { label: 'History', tokens: 20000 }] }
export const SPANS: TraceSpan[] = [{ id: 'turn', name: 'turn', start: 0, ms: 6200, tokens: 14100, cost: 0.042, children: [
  { id: 'think', name: 'reasoning', start: 0, ms: 900, tokens: 1200, cost: 0.004 },
  { id: 'search', name: 'search_code', start: 1000, ms: 640, tokens: 300, cost: 0.001 },
  { id: 'tests', name: 'run_tests', start: 1800, ms: 1900, children: [{ id: 'vitest', name: 'vitest', start: 1900, ms: 1700 }] },
  { id: 'text', name: 'stream text', start: 3800, ms: 2400, tokens: 2931, cost: 0.02 },
] }]
const VERSIONS = [{ id: 'v3', label: 'v3 · DST-safe', meta: 'Agent · now', code: '{\n  "title": "Weekly standup",\n  "rrule": "FREQ=WEEKLY;BYDAY=MO"\n}' }, { id: 'v2', label: 'v2 · added Kofi', meta: 'You · 10:31', code: '{ "title": "Standup" }' }, { id: 'v1', label: 'v1 · first draft', meta: 'Agent · 10:28', code: '{ }' }]
const STARTERS = [{ title: "Plan this week's release", description: 'From open issues and the calendar' }, { title: 'Why is CI red?', description: 'Reads the last failing run' }, { title: 'Draft the standup', description: "From yesterday's activity" }, { title: 'Find a meeting time', description: 'With Ana, Kofi and Mei' }]
const QUEUED: QueuedMessage[] = [{ id: 'q1', text: 'Also add a changelog entry' }]

export const TurnCase = () => (
  <div>
    <Message text="Why do our weekly events show up an hour late after Nov 1?" onEdit={() => {}} />
    <Assistant answer={answers.finished} n={1} onFeedback={() => {}} onRegenerate={() => {}} onBranch={() => {}} branch={{ index: 1, count: 2, onChange: () => {} }} />
  </div>
)
export const StatesCase = () => (
  <div>
    <Assistant answer={answers.none} n={1} />
    <Assistant answer={answers.stopped} n={2} quiet />
    <Assistant answer={answers.failed} n={3} onRegenerate={() => {}} />
    <Assistant answer={answers.asking} n={4} quiet />
  </div>
)
export const ToolCase = () => (
  <div>
    <ToolCall call={{ id: 'a', name: 'fetch_url', args: '{ … }', state: 'running' }} />
    <ToolCall call={{ id: 'b', name: 'search_code', args: '{ … }', state: 'done', ms: 600, output: '2 matches' }} />
    <ToolCall call={{ id: 'c', name: 'run_tests', args: '{ … }', state: 'failed', exit: 1, output: '1 failed · rrule › spring-forward gap' }} />
    <ToolCall call={{ id: 'd', name: 'delete_branch', args: '{ "name": "old" }', state: 'approval' }} quiet alwaysAllow="Always allow in this repo" />
    <ToolCall call={{ id: 'e', name: 'push', args: '{ }', state: 'denied' }} />
  </div>
)
export const PromptCase = () => <Prompt models={MODELS} model="md" commands={COMMANDS} mentions={MENTIONS} context={CONTEXT} files={[{ id: 'f', name: 'calendar-bug.png', progress: 0.4 }]} value="Hello" />
export const BusyPromptCase = () => <Prompt busy compact models={MODELS} blocked="You're offline" tools={['attach', 'mic']} />
export const PlanCase = () => <AgentPlan steps={answers.approving.plan} queue={QUEUED} />
export const TraceCase = () => <TraceViewer spans={SPANS} />
export const ArtifactCase = () => <ArtifactPanel title="Weekly standup invite" versions={VERSIONS} onOpen={() => {}}><b>Weekly standup</b><span>Mondays, 9:00–9:15 · New York</span></ArtifactPanel>
export const SpeechCase = () => <SpeechInput mics={[{ value: 'a', label: 'MacBook Pro Microphone' }, { value: 'b', label: 'AirPods Pro' }]} initial={{ final: 'Move the design crit', interim: 'to Thursday' }} />
export const PartsCase = () => (
  <div>
    <Reasoning text="Thinking it over" streaming />
    <Reasoning text="Thought it over" seconds={4} />
    <Suggestions items={STARTERS} />
    <Suggestions items={[{ title: 'Write a migration note' }]} variant="chips" />
    <Question question={{ id: 'q', prompt: 'Which branch?', options: ['main', 'release'], multiple: true }} quiet />
    <Question question={{ id: 'r', prompt: 'Which branch?', options: ['main'], answer: 'main' }} quiet />
    <Checkpoint label="Checkpoint · before edits" onRestore={() => {}} />
    <Shimmer>Reading 14 files…</Shimmer>
    <ContextMeter used={64000} limit={200000} showTokens />
    <ContextMeter used={168000} limit={200000} showTokens onCompact={() => {}} />
    <ContextMeter used={194000} limit={200000} showTokens />
    <MessageActions onCopy={() => {}} stopped />
  </div>
)

const Card = ({ title, children }: { title: string; children?: any }) => <section style="display:grid;gap:12px;min-inline-size:0"><h3>{title}</h3>{children}</section>

function Desk({ answer, phone }: { answer: Answer; phone: boolean }) {
  const draft = state('')
  const model = state('lg')
  const busy = state(false)
  const queue = state<QueuedMessage[]>(QUEUED)
  const files = state<PromptFile[]>([])
  const web = state(true)
  const rail = state<'plan' | 'trace' | 'changes'>('plan')
  let prompt: PromptControl | undefined
    return (
    <>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:0;block-size:680px;border-radius:var(--warp-radius-surface);box-shadow:inset 0 0 0 1px var(--warp-color-border);overflow:hidden">
        <Conversation title="DST drift in weekly events" bar={phone ? undefined : <Button emphasis="outline" tone="neutral" size="sm">Share</Button>} prompt={
          <Prompt value={draft} compact={phone} model={model} models={MODELS} commands={COMMANDS} mentions={MENTIONS} context={CONTEXT} onCompact={() => {}} busy={busy.value} files={files.value} web={web.value} onWebChange={v => (web.value = v)}
            onStop={() => (busy.value = false)} onSubmit={() => (busy.value = true)} onQueue={t => (queue.value = [...queue.value, { id: `q${queue.value.length + 2}`, text: t }])}
            onAttach={f => (files.value = [...files.value, ...f.map(x => ({ id: x.name, name: x.name }))])} onRemoveFile={id => (files.value = files.value.filter(f => f.id !== id))} control={c => (prompt = c)}>
            <Suggestions items={[{ title: 'Also handle the spring-forward gap' }, { title: 'Write a migration note' }]} variant="chips" style="margin:0 0 10px" onPick={s => prompt?.insert(s.title)} />
          </Prompt>
        }>
          <Message text="Why do our weekly events show up an hour late after Nov 1?" onEdit={() => {}} />
          <Assistant answer={answer} n={1} quiet alwaysAllow={() => 'Always allow edits in src/calendar'} onFeedback={() => {}} onRegenerate={() => {}} onBranch={() => {}} />
        </Conversation>
        <aside aria-label="Run" style="padding:10px 16px;overflow:auto;border-inline-start:1px solid var(--warp-color-border);background:var(--warp-color-surface-sunken)">
          <h3 data-part="sr-only">Run</h3>
          <Tabs label="Run views" value={rail.value} onChange={v => (rail.value = v)} options={[{ value: 'plan', label: 'Plan' }, { value: 'trace', label: 'Trace' }, { value: 'changes', label: 'Changes' }]}>
            {v => (v === 'plan' ? <AgentPlan steps={answer.plan} queue={queue.value} onRemoveQueued={id => (queue.value = queue.value.filter(q => q.id !== id))} />
              : v === 'trace' ? <TraceViewer spans={SPANS} />
                : <Checkpoint label="Checkpoint · before edits" onRestore={() => {}} />)}
          </Tabs>
        </aside>
      </div>
      <Card title="Speech input and mic selector"><SpeechCase /></Card>
    </>
  )
}

const search = () => typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)

export function Part() {
  const q = search()
  return (
    <div style="display:grid;gap:28px;padding:16px;max-inline-size:1240px;margin-inline:auto">
      <Toaster />
      <h1>warp agent</h1>
      <Desk answer={q.has('approval') ? answers.approving : answers.finished} phone={typeof innerWidth === 'number' && innerWidth < 600} />
      <Card title="Tool call, every state"><ToolCase /></Card>
      <Card title="Answer states"><StatesCase /></Card>
      <Card title="Parts"><PartsCase /></Card>
      <Card title="Trace"><TraceCase /></Card>
      <Card title="Plan and queue"><PlanCase /></Card>
      <Card title="Artifact panel"><ArtifactCase /></Card>
      <Card title="Offline prompt"><BusyPromptCase /></Card>
    </div>
  )
}
