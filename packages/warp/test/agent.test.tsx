import { registerArtifactPanelAPGTabsAVersions } from './agent/artifact'
import {
  registerMessageEditOpensATextarea,
  registerSuggestionsSendWhatWasPicked,
} from './agent/message-actions'
import { registerModelPickerGroupedOptionsKeysA } from './agent/model-picker'
import {
  registerCheckpointRestoresContextMeterLevelsAnd,
  registerTraceViewerIsATreegridOne,
} from './agent/plan-trace'
import { registerQuestionAFieldsetSingleChoice } from './agent/questions'
import {
  registerConversationIsAQuietLog,
  registerSpeechInputOneButtonTheSweep,
} from './agent/speech-conversation'
import { button, key, said, type } from './agent/support'
// The agent pack driven as a user would: keyboard paths, states, focus moves and announcements.
import { fireEvent } from '@testing-library/dom'
import { state } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import { foldAnswer, type AgentEvent, type AgentTool, type PlanStep } from '@weft-js/warp-core'
import { Toaster } from '../src/Toast'
import { AgentPlan } from '../src/agent/AgentPlan'
import { Assistant } from '../src/agent/Assistant'
import { Prompt, type PromptControl } from '../src/agent/Prompt'
import { Prose } from '../src/agent/Prose'
import { Reasoning } from '../src/agent/Reasoning'
import { ToolCall } from '../src/agent/ToolCall'
import { wait } from './timers.mjs'

// jsdom has no popover top layer: a closed popover stays display:none and refuses focus
beforeAll(() => {
  document.head.append(
    Object.assign(document.createElement('style'), {
      textContent: '[popover] { display: block !important }',
    }),
  )
})
afterEach(() => {
  document.body.innerHTML = ''
})

test('Assistant renders only the folded value and patches it in place as events arrive', async () => {
  const log = state<AgentEvent[]>([{ kind: 'reasoning', text: 'Hmm', at: 0 }])
  const { container: c } = render(() => <Assistant answer={foldAnswer(log.value)} n={2} />)
  const art = c.querySelector('article')!
  expect(art.getAttribute('aria-label')).toBe('Assistant answer 2')
  expect(art.getAttribute('aria-busy')).toBe('true')
  expect(art.dataset.state).toBe('streaming')
  const reasoning = c.querySelector<HTMLDetailsElement>('details[data-scope="reasoning"]')!
  expect(reasoning.open).toBe(true)
  log.value = [...log.value, { kind: 'text', text: 'First.', at: 4000 }]
  await flush()
  expect(c.querySelector('details[data-scope="reasoning"]')).toBe(reasoning)
  expect(reasoning.open).toBe(false)
  expect(reasoning.querySelector('summary')!.textContent).toContain('Thought for 4 s')
  const p = c.querySelector('[data-part="content"] > p')
  log.value = [...log.value, { kind: 'text', text: ' Second.' }]
  await flush()
  expect(c.querySelector('[data-part="content"] > p')).toBe(p)
  expect(p!.textContent).toBe('First. Second.')
  log.value = [...log.value, { kind: 'done' }]
  await flush()
  expect(art.hasAttribute('aria-busy')).toBe(false)
  expect(c.querySelector('[data-part="actions"]')).not.toBeNull()
})

test('the end of a turn is announced once; Stop keeps what arrived', async () => {
  const log = state<AgentEvent[]>([{ kind: 'text', text: 'Part' }])
  render(() => (
    <>
      <Toaster />
      <Assistant answer={foldAnswer(log.value)} />
    </>
  ))
  await flush()
  log.value = [...log.value, { kind: 'done', stopped: true }]
  await flush()
  await wait()
  expect(said(document.body)).toBe('Stopped')
  expect(document.querySelector('article')!.textContent).toContain('Part')
  expect(document.querySelector('article')!.textContent).toContain('Stopped · kept what arrived')
})

test('rows keep their nodes as the turn grows: a question keeps its picks, plan steps patch in place', async () => {
  const log = state<AgentEvent[]>([{ kind: 'question', id: 'q', prompt: 'P', options: ['a', 'b'] }])
  const steps = state<PlanStep[]>([{ id: 'a', title: 'A', state: 'running' }])
  const { container: c } = render(() => (
    <>
      <Assistant answer={foldAnswer(log.value)} quiet />
      <AgentPlan steps={steps.value} />
    </>
  ))
  const form = c.querySelector('form')!
  const b = c.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
  b!.click()
  await flush()
  const row = c.querySelector('li')
  log.value = [...log.value, { kind: 'text', text: 'later' }, { kind: 'source', title: 'S' }]
  steps.value = [{ id: 'a', title: 'A', state: 'done' }]
  await flush()
  expect(c.querySelector('form')).toBe(form)
  expect(b!.checked).toBe(true)
  expect(c.querySelector('li')).toBe(row)
  expect(row!.getAttribute('data-state')).toBe('done')
})

test('an error shows why and Retry regenerates', () => {
  const again = vi.fn()
  const a = foldAnswer([{ kind: 'error', message: 'Dropped' }])
  const { container: c } = render(() => <Assistant answer={a} onRegenerate={again} />)
  expect(c.textContent).toContain('Dropped')
  button(c, 'Retry').click()
  expect(again).toHaveBeenCalled()
})

test('the render slot replaces the default text', () => {
  const a = foldAnswer([{ kind: 'text', text: '# Hi' }])
  const { container: c } = render(() => <Assistant answer={a} render={(t) => <mark>{t}</mark>} />)
  expect(c.querySelector('mark')!.textContent).toBe('# Hi')
})

test('Prose never turns model output into markup, and an open fence is already code', () => {
  const { container: c } = render(() => (
    <Prose
      text={'<img src=x onerror=alert(1)> and `<b>` [1]\n\n```ts\nlet a = 1'}
      sources={[{ title: 'One', path: 'a.ts' }]}
      base="z"
    />
  ))
  expect(c.querySelector('img')).toBeNull()
  expect(c.querySelector('p')!.textContent).toContain('<img')
  expect(c.querySelector('p code')!.textContent).toBe('<b>')
  expect(c.querySelector('pre')!.getAttribute('aria-label')).toBe('Code, ts')
  expect(c.querySelector('pre code')!.textContent).toBe('let a = 1')
  const cite = c.querySelector<HTMLAnchorElement>('a[data-scope="cite"]')!
  expect(cite.getAttribute('aria-label')).toBe('Source 1')
  expect(cite.getAttribute('href')).toBe('#z-s1')
})

test('a citation jumps to its numbered source', async () => {
  const a = foldAnswer([
    { kind: 'text', text: 'See [1]' },
    { kind: 'source', title: 'One', path: 'a.ts' },
  ])
  const { container: c } = render(() => <Assistant answer={a} />)
  c.querySelector<HTMLElement>('a[data-scope="cite"]')!.click()
  await flush()
  const card = c.querySelector<HTMLElement>('[data-scope="sources"] a')!
  expect(document.activeElement).toBe(card)
  expect(card.querySelector('i')!.textContent).toBe('1')
})

const tool = (st: AgentTool['state'], more: Partial<AgentTool> = {}): AgentTool => ({
  id: 't',
  name: 'run_tests',
  args: '{"a":1}',
  state: st,
  ...more,
})

test('ToolCall names its state in the summary, every state', () => {
  const name = (t: AgentTool) =>
    [
      ...render(() => <ToolCall call={t} quiet />)
        .container.querySelector('summary')!
        .querySelectorAll('span:not([aria-hidden])'),
    ]
      .map((s) => s.textContent)
      .join('')
  expect(name(tool('running'))).toBe('run_tests, running')
  expect(name(tool('done', { ms: 600 }))).toBe('run_tests, done, 0.6 s')
  expect(name(tool('failed', { exit: 1 }))).toBe('run_tests, failed, exit 1')
  expect(name(tool('approval'))).toBe('run_tests, needs approval')
  expect(name(tool('denied'))).toBe('run_tests, denied')
})

test('approval takes focus, announces, shows the diff of an edit, and never runs by itself', async () => {
  const ok = vi.fn()
  const live = state(tool('running'))
  const { container: c } = render(() => (
    <>
      <Toaster />
      <ToolCall call={live.value} onApprove={ok} alwaysAllow="Always allow edits" />
    </>
  ))
  await flush()
  expect(c.querySelector('[data-part="approve"]')).toBeNull()
  live.value = tool('approval')
  await flush()
  await wait()
  expect(c.querySelector<HTMLDetailsElement>('details')!.open).toBe(true)
  expect(document.activeElement).toBe(button(c, 'Approve'))
  expect(said(c, true)).toContain('wants to run run_tests')
  expect(ok).not.toHaveBeenCalled()
  const area = c.querySelector('textarea')!
  type(area, '{"a":2}')
  await flush()
  expect(c.querySelector('[data-part="approve"] section pre')!.textContent).toBe(
    '- {"a":1}\n+ {"a":2}',
  )
  c.querySelector<HTMLInputElement>('[data-part="approve"] input')!.click()
  await flush()
  button(c, 'Approve').click()
  expect(ok).toHaveBeenCalledWith('{"a":2}', true)
  expect(document.activeElement).toBe(c.querySelector('summary'))
})

test('Deny goes to onDeny and focus stays on the card', async () => {
  const no = vi.fn()
  const t = tool('approval')
  const { container: c } = render(() => <ToolCall call={t} quiet onDeny={no} />)
  await flush()
  button(c, 'Deny').click()
  expect(no).toHaveBeenCalled()
  expect(document.activeElement).toBe(c.querySelector('summary'))
})

test('a quiet approval takes no focus', async () => {
  const t = tool('approval')
  const { container: c } = render(() => <ToolCall call={t} quiet />)
  await flush()
  await wait(5)
  expect(document.activeElement).not.toBe(button(c, 'Approve'))
})

test('Reasoning streams open with the shimmer, then folds', async () => {
  const on = state(true)
  const { container: c } = render(() => <Reasoning text="x" streaming={on.value} seconds={3} />)
  expect(c.querySelector('[data-scope="shimmer"]')!.textContent).toBe('Thinking…')
  on.value = false
  await flush()
  expect(c.querySelector('summary')!.textContent).toContain('Thought for 3 s')
})

test('Prompt: Enter sends and clears, Shift+Enter does not, an empty message does nothing', async () => {
  const sent: string[] = []
  const { container: c } = render(() => <Prompt onSubmit={(t) => sent.push(t)} />)
  const box = c.querySelector('textarea')!
  key(box, 'Enter')
  expect(sent).toEqual([])
  type(box, 'hello')
  await flush()
  key(box, 'Enter', { shiftKey: true })
  expect(sent).toEqual([])
  key(box, 'Enter')
  await flush()
  expect(sent).toEqual(['hello'])
  expect(box.value).toBe('')
  expect(c.querySelector('label')!.getAttribute('for')).toBe(box.id)
  expect(box.getAttribute('aria-describedby')).toContain('hint')
})

test('Send and Stop are one button, Escape stops, and a busy send queues', async () => {
  const busy = state(false)
  const stop = vi.fn(),
    queued: string[] = []
  const { container: c } = render(() => (
    <>
      <Toaster />
      <Prompt
        busy={busy.value}
        onStop={stop}
        onQueue={(t) => queued.push(t)}
        onSubmit={() => (busy.value = true)}
      />
    </>
  ))
  const send = c.querySelector<HTMLElement>('[data-part="send"]')!
  const box = c.querySelector('textarea')!
  type(box, 'go')
  send.focus()
  send.click()
  await flush()
  expect(c.querySelector('[data-part="send"]')).toBe(send)
  expect(send.getAttribute('aria-label')).toBe('Stop')
  expect(document.activeElement).toBe(send)
  key(box, 'Escape')
  expect(stop).toHaveBeenCalledTimes(1)
  send.click()
  expect(stop).toHaveBeenCalledTimes(2)
  type(box, 'next')
  key(box, 'Enter')
  await flush()
  await wait()
  expect(queued).toEqual(['next'])
  expect(said(c)).toContain('Queued')
})

test('offline: Send says why and does nothing', () => {
  const sent = vi.fn()
  const { container: c } = render(() => (
    <Prompt onSubmit={sent} blocked="You're offline" value="hi" />
  ))
  const send = c.querySelector<HTMLElement>('[data-part="send"]')!
  expect(send.getAttribute('aria-disabled')).toBe('true')
  send.click()
  key(c.querySelector('textarea')!, 'Enter')
  expect(sent).not.toHaveBeenCalled()
  expect(c.textContent).toContain("You're offline")
})

test('slash commands: / opens the listbox on the textarea, arrows move, Enter inserts, Escape closes', async () => {
  const { container: c } = render(() => (
    <Prompt commands={[{ value: '/plan' }, { value: '/test' }]} />
  ))
  const box = c.querySelector('textarea')!
  type(box, '/')
  await flush()
  const list = c.querySelector('[role="listbox"]')!
  expect(box.getAttribute('aria-controls')).toBe(list.id)
  expect(
    document.getElementById(box.getAttribute('aria-activedescendant')!)!.textContent,
  ).toContain('/plan')
  key(box, 'ArrowDown')
  await flush()
  expect(
    document.getElementById(box.getAttribute('aria-activedescendant')!)!.textContent,
  ).toContain('/test')
  key(box, 'Enter')
  await flush()
  expect(box.value).toBe('/test ')
  expect(c.querySelector('[data-scope="suggest"]')).toBeNull()
  type(box, '/')
  await flush()
  key(box, 'Escape')
  await flush()
  expect(c.querySelector('[data-scope="suggest"]')).toBeNull()
  expect(box.hasAttribute('aria-activedescendant')).toBe(false)
})

test('@ mentions filter as you type, mid-message', async () => {
  const { container: c } = render(() => (
    <Prompt mentions={[{ value: '@ana' }, { value: '@kofi' }]} />
  ))
  const box = c.querySelector('textarea')!
  type(box, 'ask @k')
  await flush()
  expect(
    [...c.querySelectorAll('[role="option"]')].map(
      (o) => o.querySelector('[data-part="cmd"]')!.textContent,
    ),
  ).toEqual(['@kofi'])
  key(box, 'Tab')
  await flush()
  expect(box.value).toBe('ask @kofi ')
})

test('attachments: the button, a remove, and a drop that holds the sweep', async () => {
  const added: File[][] = [],
    gone: string[] = []
  const { container: c } = render(() => (
    <Prompt
      onAttach={(f) => added.push(f)}
      onRemoveFile={(id) => gone.push(id)}
      files={[{ id: 'a', name: 'a.png', progress: 0.5 }]}
    />
  ))
  expect(c.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('50')
  button(c, 'Remove a.png').click()
  expect(gone).toEqual(['a'])
  const host = c.querySelector<HTMLElement>('[data-scope="composer"]')!
  fireEvent.dragOver(host)
  await flush()
  expect(host.hasAttribute('data-pin')).toBe(true)
  const f = new File(['x'], 'b.txt')
  fireEvent.drop(host, { dataTransfer: { files: [f] } })
  await flush()
  expect(host.hasAttribute('data-pin')).toBe(false)
  expect(added[0]).toEqual([f])
})

test('control.insert writes into the composer and focuses it', async () => {
  let ctl: PromptControl
  const { container: c } = render(() => (
    <>
      <Toaster />
      <Prompt control={(k) => (ctl = k)} />
    </>
  ))
  await flush()
  ctl!.insert('dictated')
  await flush()
  const box = c.querySelector('textarea')!
  expect(box.value).toBe('dictated')
  expect(document.activeElement).toBe(box)
})

test('the web toggle and mic button are pressed states', async () => {
  const on = state(false)
  const mic = vi.fn()
  const { container: c } = render(() => (
    <Prompt web={on.value} onWebChange={(v) => (on.value = v)} onMic={mic} />
  ))
  const web = [...c.querySelectorAll('button')].find((b) => b.textContent === 'Web')!
  web.click()
  await flush()
  expect(web.getAttribute('aria-pressed')).toBe('true')
  button(c, 'Dictate').click()
  expect(mic).toHaveBeenCalled()
})

registerModelPickerGroupedOptionsKeysA()
registerMessageEditOpensATextarea()
registerSuggestionsSendWhatWasPicked()
registerQuestionAFieldsetSingleChoice()
registerCheckpointRestoresContextMeterLevelsAnd()
registerTraceViewerIsATreegridOne()
registerArtifactPanelAPGTabsAVersions()
registerSpeechInputOneButtonTheSweep()
registerConversationIsAQuietLog()
