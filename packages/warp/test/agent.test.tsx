// The agent pack driven as a user would: keyboard paths, states, focus moves and announcements.
import { fireEvent } from '@testing-library/dom'
import { foldAnswer, type AgentEvent, type AgentTool, type DictationEngine, type DictationEvents } from '@weft-js/warp-core'
import { state } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import { Toaster } from '../src/Toast'
import { BranchSwitcher, MessageActions } from '../src/agent/Actions'
import { AgentPlan } from '../src/agent/AgentPlan'
import { ArtifactPanel } from '../src/agent/ArtifactPanel'
import { Assistant } from '../src/agent/Assistant'
import { Checkpoint } from '../src/agent/Checkpoint'
import { ContextMeter } from '../src/agent/ContextMeter'
import { Conversation } from '../src/agent/Conversation'
import { Message } from '../src/agent/Message'
import { ModelPicker } from '../src/agent/ModelPicker'
import { Prompt, type PromptControl } from '../src/agent/Prompt'
import { Prose } from '../src/agent/Prose'
import { Question } from '../src/agent/Question'
import { Reasoning } from '../src/agent/Reasoning'
import { SpeechInput } from '../src/agent/SpeechInput'
import { Suggestions } from '../src/agent/Suggestions'
import { ToolCall } from '../src/agent/ToolCall'
import { TraceViewer } from '../src/agent/TraceViewer'

const said = (c: Element, urgent = false) => document.querySelector(`[data-scope="announcer"][aria-live="${urgent ? 'assertive' : 'polite'}"]`)?.textContent ?? c.textContent
const wait = (ms = 80) => new Promise(r => setTimeout(r, ms))
const button = (c: Element, name: string) => [...c.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent)?.trim() === name) as HTMLButtonElement
const key = (el: Element, k: string, o: object = {}) => fireEvent.keyDown(el, { key: k, ...o })
const type = (el: HTMLTextAreaElement, v: string) => { el.value = v; el.setSelectionRange(v.length, v.length); fireEvent.input(el) }
// jsdom has no popover top layer: a closed popover stays display:none and refuses focus
beforeAll(() => { document.head.append(Object.assign(document.createElement('style'), { textContent: '[popover] { display: block !important }' })) })
afterEach(() => { document.body.innerHTML = '' })

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
  render(() => <><Toaster /><Assistant answer={foldAnswer(log.value)} /></>)
  await flush()
  log.value = [...log.value, { kind: 'done', stopped: true }]
  await flush(); await wait()
  expect(said(document.body)).toBe('Stopped')
  expect(document.querySelector('article')!.textContent).toContain('Part')
  expect(document.querySelector('article')!.textContent).toContain('Stopped · kept what arrived')
})

test('rows keep their nodes as the turn grows: a question keeps its picks, plan steps patch in place', async () => {
  const log = state<AgentEvent[]>([{ kind: 'question', id: 'q', prompt: 'P', options: ['a', 'b'] }])
  const steps = state([{ id: 'a', title: 'A', state: 'running' as const }])
  const { container: c } = render(() => <><Assistant answer={foldAnswer(log.value)} quiet /><AgentPlan steps={steps.value as any} /></>)
  const form = c.querySelector('form')!
  const b = c.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
  b.click(); await flush()
  const row = c.querySelector('li')
  log.value = [...log.value, { kind: 'text', text: 'later' }, { kind: 'source', title: 'S' }]
  steps.value = [{ id: 'a', title: 'A', state: 'done' as any }]
  await flush()
  expect(c.querySelector('form')).toBe(form)
  expect(b.checked).toBe(true)
  expect(c.querySelector('li')).toBe(row)
  expect(row!.getAttribute('data-state')).toBe('done')
})

test('an error shows why and Retry regenerates', async () => {
  const again = vi.fn()
  const a = foldAnswer([{ kind: 'error', message: 'Dropped' }])
  const { container: c } = render(() => <Assistant answer={a} onRegenerate={again} />)
  expect(c.textContent).toContain('Dropped')
  button(c, 'Retry').click()
  expect(again).toHaveBeenCalled()
})

test('the render slot replaces the default text', () => {
  const a = foldAnswer([{ kind: 'text', text: '# Hi' }])
  const { container: c } = render(() => <Assistant answer={a} render={t => <mark>{t}</mark>} />)
  expect(c.querySelector('mark')!.textContent).toBe('# Hi')
})

test('Prose never turns model output into markup, and an open fence is already code', () => {
  const { container: c } = render(() => <Prose text={'<img src=x onerror=alert(1)> and `<b>` [1]\n\n```ts\nlet a = 1'} sources={[{ title: 'One', path: 'a.ts' }]} base="z" />)
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
  const a = foldAnswer([{ kind: 'text', text: 'See [1]' }, { kind: 'source', title: 'One', path: 'a.ts' }])
  const { container: c } = render(() => <Assistant answer={a} />)
  c.querySelector<HTMLElement>('a[data-scope="cite"]')!.click()
  await flush()
  const card = c.querySelector<HTMLElement>('[data-scope="sources"] a')!
  expect(document.activeElement).toBe(card)
  expect(card.querySelector('i')!.textContent).toBe('1')
})

const tool = (state: AgentTool['state'], more: Partial<AgentTool> = {}): AgentTool => ({ id: 't', name: 'run_tests', args: '{"a":1}', state, ...more })

test('ToolCall names its state in the summary, every state', () => {
  const name = (t: AgentTool) => [...render(() => <ToolCall call={t} quiet />).container.querySelector('summary')!.querySelectorAll('span:not([aria-hidden])')].map(s => s.textContent).join('')
  expect(name(tool('running'))).toBe('run_tests, running')
  expect(name(tool('done', { ms: 600 }))).toBe('run_tests, done, 0.6 s')
  expect(name(tool('failed', { exit: 1 }))).toBe('run_tests, failed, exit 1')
  expect(name(tool('approval'))).toBe('run_tests, needs approval')
  expect(name(tool('denied'))).toBe('run_tests, denied')
})

test('approval takes focus, announces, shows the diff of an edit, and never runs by itself', async () => {
  const ok = vi.fn()
  const live = state(tool('running'))
  const { container: c } = render(() => <><Toaster /><ToolCall call={live.value} onApprove={ok} alwaysAllow="Always allow edits" /></>)
  await flush()
  expect(c.querySelector('[data-part="approve"]')).toBeNull()
  live.value = tool('approval')
  await flush(); await wait()
  expect(c.querySelector<HTMLDetailsElement>('details')!.open).toBe(true)
  expect(document.activeElement).toBe(button(c, 'Approve'))
  expect(said(c, true)).toContain('wants to run run_tests')
  expect(ok).not.toHaveBeenCalled()
  const area = c.querySelector('textarea')!
  type(area, '{"a":2}')
  await flush()
  expect(c.querySelector('[data-part="approve"] section pre')!.textContent).toBe('- {"a":1}\n+ {"a":2}')
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
  await flush(); await wait(5)
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
  const { container: c } = render(() => <Prompt onSubmit={t => sent.push(t)} />)
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
  const stop = vi.fn(), queued: string[] = []
  const { container: c } = render(() => <><Toaster /><Prompt busy={busy.value} onStop={stop} onQueue={t => queued.push(t)} onSubmit={() => (busy.value = true)} /></>)
  const send = c.querySelector<HTMLElement>('[data-part="send"]')!
  const box = c.querySelector('textarea')!
  type(box, 'go')
  send.focus(); send.click()
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
  await flush(); await wait()
  expect(queued).toEqual(['next'])
  expect(said(c)).toContain('Queued')
})

test('offline: Send says why and does nothing', async () => {
  const sent = vi.fn()
  const { container: c } = render(() => <Prompt onSubmit={sent} blocked="You're offline" value="hi" />)
  const send = c.querySelector<HTMLElement>('[data-part="send"]')!
  expect(send.getAttribute('aria-disabled')).toBe('true')
  send.click()
  key(c.querySelector('textarea')!, 'Enter')
  expect(sent).not.toHaveBeenCalled()
  expect(c.textContent).toContain("You're offline")
})

test('slash commands: / opens the listbox on the textarea, arrows move, Enter inserts, Escape closes', async () => {
  const { container: c } = render(() => <Prompt commands={[{ value: '/plan' }, { value: '/test' }]} />)
  const box = c.querySelector('textarea')!
  type(box, '/')
  await flush()
  const list = c.querySelector('[role="listbox"]')!
  expect(box.getAttribute('aria-controls')).toBe(list.id)
  expect(document.getElementById(box.getAttribute('aria-activedescendant')!)!.textContent).toContain('/plan')
  key(box, 'ArrowDown')
  await flush()
  expect(document.getElementById(box.getAttribute('aria-activedescendant')!)!.textContent).toContain('/test')
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
  const { container: c } = render(() => <Prompt mentions={[{ value: '@ana' }, { value: '@kofi' }]} />)
  const box = c.querySelector('textarea')!
  type(box, 'ask @k')
  await flush()
  expect([...c.querySelectorAll('[role="option"]')].map(o => o.querySelector('[data-part="cmd"]')!.textContent)).toEqual(['@kofi'])
  key(box, 'Tab')
  await flush()
  expect(box.value).toBe('ask @kofi ')
})

test('attachments: the button, a remove, and a drop that holds the sweep', async () => {
  const added: File[][] = [], gone: string[] = []
  const { container: c } = render(() => <Prompt onAttach={f => added.push(f)} onRemoveFile={id => gone.push(id)} files={[{ id: 'a', name: 'a.png', progress: 0.5 }]} />)
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
  const { container: c } = render(() => <><Toaster /><Prompt control={k => (ctl = k)} /></>)
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
  const { container: c } = render(() => <Prompt web={on.value} onWebChange={v => (on.value = v)} onMic={mic} />)
  const web = [...c.querySelectorAll('button')].find(b => b.textContent === 'Web')!
  web.click()
  await flush()
  expect(web.getAttribute('aria-pressed')).toBe('true')
  button(c, 'Dictate').click()
  expect(mic).toHaveBeenCalled()
})

const MODELS = [{ id: 'a', name: 'Large', provider: 'One', capabilities: ['tools'], context: '200k', cost: '$$$' }, { id: 'b', name: 'Small', short: 'S', provider: 'Two', context: '8k', cost: '$' }]

test('ModelPicker: grouped options, keys, a pick closes and returns focus', async () => {
  const seen: string[] = []
  const { container: c } = render(() => <><Toaster /><ModelPicker models={MODELS} onChange={v => seen.push(v)} /></>)
  await flush()
  const chip = c.querySelector<HTMLElement>('[data-part="model"]')!
  chip.focus(); chip.click()
  await flush()
  expect(chip.getAttribute('aria-expanded')).toBe('true')
  const opts = [...c.querySelectorAll<HTMLElement>('[role="option"]')]
  expect(c.querySelectorAll('[role="listbox"] [role="group"]').length).toBe(2)
  expect(document.activeElement).toBe(opts[0])
  expect(opts[0].textContent).toContain('tools')
  expect(opts[0].textContent).toContain('200k · $$$')
  key(opts[0], 'ArrowDown')
  expect(document.activeElement).toBe(opts[1])
  key(opts[1], 'Enter')
  await flush()
  expect(seen).toEqual(['b'])
  expect(chip.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(chip)
  expect(chip.textContent).toContain('Small')
})

test('Escape closes the picker with no change, and the compact chip shows the short name', async () => {
  const seen = vi.fn()
  const { container: c } = render(() => <ModelPicker models={MODELS} value="b" compact onChange={seen} />)
  await flush()
  const chip = c.querySelector<HTMLElement>('[data-part="model"]')!
  expect(chip.textContent).toContain('S')
  chip.click()
  await flush()
  key(document.activeElement!, 'Escape')
  await flush()
  expect(chip.getAttribute('aria-expanded')).toBe('false')
  expect(seen).not.toHaveBeenCalled()
})

test('Message: Edit opens a textarea in place, Save reports, Escape cancels, focus returns', async () => {
  const edits: string[] = []
  const { container: c } = render(() => <Message text="hi" onEdit={t => edits.push(t)} />)
  button(c, 'Edit message').click()
  await flush(); await wait(0)
  const box = c.querySelector('textarea')!
  expect(document.activeElement).toBe(box)
  key(box, 'Escape')
  await flush(); await wait(0)
  expect(c.querySelector('textarea')).toBeNull()
  expect(document.activeElement).toBe(button(c, 'Edit message'))
  button(c, 'Edit message').click()
  await flush(); await wait(0)
  type(c.querySelector('textarea')!, 'changed')
  await flush()
  button(c, 'Save').click()
  await flush()
  expect(edits).toEqual(['changed'])
})

test('message actions: thumbs toggle, bad opens a reason, and the reason is reported', async () => {
  const seen: any[][] = []
  const { container: c } = render(() => <><Toaster /><MessageActions onFeedback={(v, r) => seen.push([v, r])} /></>)
  await flush()
  const good = button(c, 'Good answer'), bad = button(c, 'Bad answer')
  good.click(); await flush()
  expect(good.getAttribute('aria-pressed')).toBe('true')
  good.click(); await flush()
  expect(good.getAttribute('aria-pressed')).toBe('false')
  bad.click(); await flush()
  const panel = c.querySelector<HTMLElement>('[role="dialog"]')!
  expect(panel.dataset.state).toBe('open')
  button(panel, 'Too long').click()
  await flush()
  expect(seen.at(-1)).toEqual(['down', 'Too long'])
  expect(panel.dataset.state).toBeUndefined()
})

test('BranchSwitcher appears at two versions and stops at the ends', async () => {
  const at = state(0)
  const { container: c } = render(() => <><BranchSwitcher index={0} count={1} onChange={() => {}} /><BranchSwitcher index={at.value} count={2} onChange={v => (at.value = v)} /></>)
  expect(c.querySelectorAll('[data-scope="branch"]').length).toBe(1)
  expect(button(c, 'Previous version').disabled).toBe(true)
  button(c, 'Next version').click(); await flush()
  expect(c.querySelector('[data-scope="branch"]')!.textContent).toBe('2/2')
  expect(button(c, 'Next version').disabled).toBe(true)
})

test('Suggestions send what was picked; chips are the chip variant', () => {
  const picked: string[] = []
  const { container: c } = render(() => <Suggestions variant="chips" items={[{ title: 'One' }]} onPick={s => picked.push(s.title)} />)
  expect(c.querySelector<HTMLElement>('[data-scope="suggestions"]')!.dataset.variant).toBe('chips')
  c.querySelector('button')!.click()
  expect(picked).toEqual(['One'])
})

test('Question: a fieldset, single choice by default, free text, and read back once answered', async () => {
  const got: any[] = []
  const q = state<any>({ id: 'q', prompt: 'Which?', options: ['a', 'b'], free: true })
  const { container: c } = render(() => <><Toaster /><Question question={q.value} onAnswer={a => got.push(a)} /></>)
  await flush(); await wait()
  expect(said(c, true)).toContain('question')
  expect(c.querySelector('legend')!.textContent).toBe('Which?')
  expect(c.textContent).toContain('Waiting for you')
  const radios = c.querySelectorAll<HTMLInputElement>('input[type="radio"]')
  expect(radios[0].checked).toBe(true)
  radios[2].click()
  await flush()
  const text = c.querySelector<HTMLInputElement>('input[data-part="input"]')!
  text.value = 'c'; fireEvent.input(text)
  await flush()
  fireEvent.submit(c.querySelector('form')!)
  expect(got).toEqual(['c'])
  q.value = { ...q.value, answer: 'c' }
  await flush()
  expect(c.querySelector('form')).toBeNull()
  expect(c.textContent).toContain('You chose: c')
})

test('a multiple question gives every pick; a question closed by Stop is disabled', async () => {
  const got: any[] = []
  const { container: c } = render(() => <><Question quiet question={{ id: 'm', prompt: 'P', options: ['a', 'b'], multiple: true }} onAnswer={a => got.push(a)} /><Question quiet question={{ id: 'n', prompt: 'Q', options: ['a'], closed: true }} /></>)
  const boxes = c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  boxes[0].click(); boxes[1].click()
  await flush()
  fireEvent.submit(c.querySelector('form')!)
  expect(got).toEqual([['a', 'b']])
  expect(c.querySelectorAll('fieldset')[1].disabled).toBe(true)
})

test('Checkpoint restores; ContextMeter levels and /compact', async () => {
  const restore = vi.fn(), compact = vi.fn()
  const { container: c } = render(() => <><Checkpoint label="Before" onRestore={restore} /><ContextMeter used={10} limit={100} /><ContextMeter used={80} limit={100} onCompact={compact} /><ContextMeter used={95} limit={100} /></>)
  button(c, 'Restore').click()
  expect(restore).toHaveBeenCalled()
  const m = [...c.querySelectorAll<HTMLElement>('[data-scope="context-meter"]')]
  expect(m.map(x => x.dataset.level)).toEqual([undefined, 'high', 'full'])
  expect(m[1].getAttribute('role')).toBe('meter')
  expect(m[1].getAttribute('aria-valuenow')).toBe('80')
  button(c, '/compact').click()
  expect(compact).toHaveBeenCalled()
})

test('AgentPlan shows each state, counts done, and removes from the queue', async () => {
  const gone: string[] = []
  const { container: c } = render(() => <AgentPlan steps={[{ id: 'a', title: 'A', state: 'done' }, { id: 'b', title: 'B', state: 'running' }, { id: 'c', title: 'C', state: 'blocked' }, { id: 'd', title: 'D', state: 'pending' }]} queue={[{ id: 'q', text: 'later' }]} onRemoveQueued={id => gone.push(id)} />)
  expect([...c.querySelectorAll('li')].map(l => l.getAttribute('data-state'))).toEqual(['done', 'running', 'blocked', 'pending'])
  expect(c.querySelector('[data-part="header"]')!.textContent).toContain('1/4')
  expect(c.textContent).toContain('Waiting for your approval')
  expect(c.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('25')
  button(c, 'Remove from queue: later').click()
  expect(gone).toEqual(['q'])
})

test('TraceViewer is a treegrid: one tab stop, arrows move and fold, Enter toggles', async () => {
  const spans = [{ id: 'r', name: 'turn', start: 0, ms: 1000, tokens: 2000, cost: 0.01, children: [{ id: 'a', name: 'a', start: 0, ms: 500 }, { id: 'b', name: 'b', start: 500, ms: 500 }] }]
  const { container: c } = render(() => <TraceViewer spans={spans} />)
  const rows = () => [...c.querySelectorAll<HTMLElement>('[role="row"]')]
  const grid = c.querySelector('[role="treegrid"]')!
  expect(rows().length).toBe(3)
  expect(rows().filter(r => r.tabIndex === 0).length).toBe(1)
  expect(rows()[0].getAttribute('aria-expanded')).toBe('true')
  expect(rows()[1].getAttribute('aria-level')).toBe('2')
  expect(rows()[0].getAttribute('aria-label')).toBe('turn, 1.0 s · 2k tok · $0.010')
  rows()[0].focus()
  key(rows()[0], 'ArrowDown')
  await flush(); await wait(0)
  expect(document.activeElement).toBe(rows()[1])
  key(grid, 'ArrowLeft')
  await flush(); await wait(0)
  expect(document.activeElement).toBe(rows()[0])
  key(rows()[0], 'ArrowLeft')
  await flush()
  expect(rows().length).toBe(1)
  expect(rows()[0].getAttribute('aria-expanded')).toBe('false')
  key(rows()[0], 'Enter')
  await flush()
  expect(rows().length).toBe(3)
})

const VERSIONS = [{ id: 'v2', label: 'v2 · new', code: 'two' }, { id: 'v1', label: 'v1 · old', code: 'one' }]

test('ArtifactPanel: APG tabs, a versions listbox, Code follows the version', async () => {
  const seen: string[] = []
  const { container: c } = render(() => <><Toaster /><ArtifactPanel title="T" versions={VERSIONS} onVersion={v => seen.push(v)}>hello</ArtifactPanel></>)
  await flush()
  const tabs = [...c.querySelectorAll<HTMLElement>('[role="tab"]')]
  const panels = () => [...c.querySelectorAll<HTMLElement>('[role="tabpanel"]')].map(p => p.hidden)
  expect(panels()).toEqual([false, true, true])
  tabs[0].focus()
  key(tabs[0], 'ArrowRight')
  await flush()
  expect(document.activeElement).toBe(tabs[1])
  expect(panels()).toEqual([true, false, true])
  expect(c.querySelector('pre')!.textContent).toBe('two')
  key(tabs[1], 'End')
  await flush()
  expect(tabs[2].getAttribute('aria-selected')).toBe('true')
  const opts = [...c.querySelectorAll<HTMLElement>('[role="option"]')]
  expect(opts[0].getAttribute('aria-current')).toBe('true')
  opts[0].focus()
  key(opts[0], 'ArrowDown')
  await flush(); await wait()
  expect(seen).toEqual(['v1'])
  expect(opts[1].getAttribute('aria-selected')).toBe('true')
  expect(document.activeElement).toBe(opts[1])
  expect(c.querySelector('pre')!.textContent).toBe('one')
  expect(said(c)).toContain('v1 · old')
})

test('ArtifactPanel Copy writes the code and says so', async () => {
  const write = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
  const { container: c } = render(() => <><Toaster /><ArtifactPanel title="T" versions={VERSIONS}>x</ArtifactPanel></>)
  await flush()
  button(c, 'Copy').click()
  await wait()
  expect(write).toHaveBeenCalledWith('two')
  expect(said(c)).toBe('Copied to clipboard')
})

function fakeEngine() {
  let on: DictationEvents
  const calls: string[] = []
  const engine = (e: DictationEvents): DictationEngine => { on = e; return { start: m => { calls.push(`start:${m ?? ''}`); e.onState('listening') }, stop: () => { calls.push('stop'); e.onState('idle') } } }
  return { engine, calls, get on() { return on } }
}

test('SpeechInput: one button, the sweep held, grey then ink words, then Insert', async () => {
  const fake = fakeEngine()
  const got: string[] = []
  const { container: c } = render(() => <><Toaster /><SpeechInput mics={[{ value: 'm', label: 'Mic' }]} engine={fake.engine} onInsert={t => got.push(t)} /></>)
  await flush()
  const rec = button(c, 'Start dictation')
  rec.click()
  await flush()
  expect(button(c, 'Stop dictation')).toBe(rec)
  expect(rec.getAttribute('aria-pressed')).toBe('true')
  expect(c.querySelector('[data-scope="speech"]')!.getAttribute('data-state')).toBe('listening')
  expect(c.querySelector('[data-part="strip"]')!.hasAttribute('data-pin')).toBe(true)
  expect(c.querySelectorAll('[data-part="wave"] i').length).toBe(40)
  fake.on.onTranscript('Move the crit', 'to Thu')
  await flush()
  expect(c.querySelector('[data-part="interim"]')!.textContent).toBe('to Thu')
  expect(button(c, 'Insert into message').disabled).toBe(true)
  fake.on.onLevel(0.5)
  await flush()
  rec.click()
  await flush()
  expect(fake.calls).toEqual(['start:', 'stop'])
  expect(c.querySelector('[data-part="strip"]')!.hasAttribute('data-pin')).toBe(false)
  button(c, 'Insert into message').click()
  expect(got).toEqual(['Move the crit to Thu'])
})

test('a blocked mic is a caution Alert with the fix, announced', async () => {
  const fake = fakeEngine()
  const { container: c } = render(() => <><Toaster /><SpeechInput mics={[]} engine={e => { const x = fake.engine(e); return { ...x, start: () => e.onState('blocked') } }} /></>)
  await flush()
  button(c, 'Start dictation').click()
  await flush(); await wait()
  expect(c.textContent).toContain('The browser is blocking the microphone')
  expect(said(c, true)).toContain('Microphone blocked')
  expect(button(c, 'Start dictation').disabled).toBe(false)
})

test('Conversation is a quiet log; Jump to latest appears away from the bottom and goes back', async () => {
  const { container: c } = render(() => <Conversation title="T"><p>Hi</p></Conversation>)
  await flush(); await wait(0)
  const log = c.querySelector<HTMLElement>('[role="log"]')!
  expect(log.getAttribute('aria-live')).toBe('off')
  expect(c.querySelector('h2')!.textContent).toBe('T')
  Object.defineProperty(log, 'scrollHeight', { value: 1000, configurable: true })
  Object.defineProperty(log, 'clientHeight', { value: 100, configurable: true })
  log.scrollTop = 500
  fireEvent.scroll(log)
  await flush()
  const jump = button(c, 'Jump to latest')
  expect(jump).toBeTruthy()
  jump.click()
  await flush()
  expect(log.scrollTop).toBe(1000)
  expect(button(c, 'Jump to latest')).toBeUndefined()
  expect(document.activeElement).toBe(log)
})
