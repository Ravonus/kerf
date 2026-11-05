import { state } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import { Toaster } from '../../src/Toast'
import { BranchSwitcher, MessageActions } from '../../src/agent/Actions'
import { Message } from '../../src/agent/Message'
import { Suggestions } from '../../src/agent/Suggestions'
import { wait } from '../timers.mjs'
import { button, key, type } from './support'

export function registerMessageEditOpensATextarea() {
  test('Message: Edit opens a textarea in place, Save reports, Escape cancels, focus returns', async () => {
    const edits: string[] = []
    const { container: c } = render(() => <Message text="hi" onEdit={(t) => edits.push(t)} />)
    button(c, 'Edit message').click()
    await flush()
    await wait(0)
    const box = c.querySelector('textarea')!
    expect(document.activeElement).toBe(box)
    key(box, 'Escape')
    await flush()
    await wait(0)
    expect(c.querySelector('textarea')).toBeNull()
    expect(document.activeElement).toBe(button(c, 'Edit message'))
    button(c, 'Edit message').click()
    await flush()
    await wait(0)
    type(c.querySelector('textarea')!, 'changed')
    await flush()
    button(c, 'Save').click()
    await flush()
    expect(edits).toEqual(['changed'])
  })
  test('message actions: thumbs toggle, bad opens a reason, and the reason is reported', async () => {
    const seen: unknown[][] = []
    const { container: c } = render(() => (
      <>
        <Toaster />
        <MessageActions onFeedback={(v, r) => seen.push([v, r])} />
      </>
    ))
    await flush()
    const good = button(c, 'Good answer'),
      bad = button(c, 'Bad answer')
    good.click()
    await flush()
    expect(good.getAttribute('aria-pressed')).toBe('true')
    good.click()
    await flush()
    expect(good.getAttribute('aria-pressed')).toBe('false')
    bad.click()
    await flush()
    const panel = c.querySelector<HTMLElement>('[role="dialog"]')!
    expect(panel.dataset.state).toBe('open')
    button(panel, 'Too long').click()
    await flush()
    expect(seen.at(-1)).toEqual(['down', 'Too long'])
    expect(panel.dataset.state).toBeUndefined()
  })
  test('BranchSwitcher appears at two versions and stops at the ends', async () => {
    const at = state(0)
    const { container: c } = render(() => (
      <>
        <BranchSwitcher index={0} count={1} onChange={() => {}} />
        <BranchSwitcher index={at.value} count={2} onChange={(v) => (at.value = v)} />
      </>
    ))
    expect(c.querySelectorAll('[data-scope="branch"]').length).toBe(1)
    expect(button(c, 'Previous version').disabled).toBe(true)
    button(c, 'Next version').click()
    await flush()
    expect(c.querySelector('[data-scope="branch"]')!.textContent).toBe('2/2')
    expect(button(c, 'Next version').disabled).toBe(true)
  })
}

export function registerSuggestionsSendWhatWasPicked() {
  test('Suggestions send what was picked; chips are the chip variant', () => {
    const picked: string[] = []
    const { container: c } = render(() => (
      <Suggestions
        variant="chips"
        items={[{ title: 'One' }]}
        onPick={(s) => picked.push(s.title)}
      />
    ))
    expect(c.querySelector<HTMLElement>('[data-scope="suggestions"]')!.dataset.variant).toBe(
      'chips',
    )
    c.querySelector('button')!.click()
    expect(picked).toEqual(['One'])
  })
}
