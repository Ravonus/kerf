// `inline` draws an overlay open in the page's flow (docs, hub previews): the surface is there with no top layer, no
// scrim, no focus trap and no placement, and `open` (or the trigger) still shows and hides it.
import { flush, render } from '@kerf/core/test'
import { state } from '@kerf/core'
import { Button, Drawer, Modal, Popover, Tooltip } from '../src/index'

const spy = (proto: Record<string, unknown>, name: string) => {
  const calls: string[] = []
  const was = proto[name]
  proto[name] = function (this: Element) {
    calls.push(this.getAttribute('data-scope') ?? '')
  }
  return {
    calls,
    restore: () => {
      if (was) proto[name] = was
      else delete proto[name]
    },
  }
}

test('Modal and Drawer inline: a non-modal <dialog open> in flow, never showModal, and data-close closes by `open`', async () => {
  const modal = spy(HTMLDialogElement.prototype as unknown as Record<string, unknown>, 'showModal')
  try {
    const m = state(true),
      d = state(true)
    const { container: c } = render(() => (
      <>
        <Modal inline open={m} title="Rename project" footer={<Button data-close="">Done</Button>}>
          Body
        </Modal>
        <Drawer inline open={d} side="right" title="Deploy">
          Rows
        </Drawer>
      </>
    ))
    await flush()
    const [dlg, sheet] = [...c.querySelectorAll('dialog')] as [HTMLDialogElement, HTMLDialogElement]
    for (const el of [dlg, sheet]) {
      expect(el.hasAttribute('open')).toBe(true)
      expect(el.getAttribute('data-presentation')).toBe('inline')
    }
    expect(dlg.getAttribute('data-scope')).toBe('dialog')
    expect(sheet.getAttribute('data-side')).toBe('right')
    expect(dlg.querySelector('[data-part="title"]')!.textContent).toBe('Rename project')
    expect(modal.calls).toEqual([])
    dlg.querySelector<HTMLElement>('[data-part="footer"] [data-close]')!.click()
    await flush()
    expect(m.value).toBe(false)
    expect(dlg.hasAttribute('open')).toBe(false)
    sheet.querySelector<HTMLElement>('[data-part="close"]')!.click()
    await flush()
    expect(d.value).toBe(false)
    m.value = true
    await flush()
    expect(dlg.hasAttribute('open')).toBe(true)
    expect(modal.calls).toEqual([])
  } finally {
    modal.restore()
  }
})

test('Popover inline: the panel is open in flow under its trigger, with no popover attribute; the trigger shows and hides it', async () => {
  const { container: c } = render(() => (
    <Popover
      inline
      label="What is a preview?"
      title="Preview deploys"
      description="Every branch gets an address."
    />
  ))
  await flush()
  const panel = c.querySelector<HTMLElement>('[data-scope="popover"][data-part="content"]')!
  const trigger = c.querySelector<HTMLButtonElement>('button')!
  expect(panel.hasAttribute('popover')).toBe(false)
  expect(panel.getAttribute('data-presentation')).toBe('inline')
  expect(panel.getAttribute('data-state')).toBe('open')
  expect(panel.hidden).toBe(false)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(trigger.nextElementSibling).toBe(panel)
  trigger.click()
  await flush()
  expect(panel.hidden).toBe(true)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

test('Tooltip inline: the tip shows under its trigger with no popover attribute, and still describes it', async () => {
  const { container: c } = render(() => (
    <Tooltip inline content="Runs on every region" kbd="⌘D">
      <Button>Deploy everywhere</Button>
    </Tooltip>
  ))
  await flush()
  const tip = c.querySelector<HTMLElement>('[role="tooltip"]')!
  expect(tip.hasAttribute('popover')).toBe(false)
  expect(tip.getAttribute('data-presentation')).toBe('inline')
  expect(c.querySelector('button')!.getAttribute('aria-describedby')).toBe(tip.id)
})

test('without inline nothing changes: a manual popover, and a Modal with no open attribute until it opens', async () => {
  const { container: c } = render(() => (
    <>
      <Popover label="Details" title="T" />
      <Tooltip content="Tip">
        <Button>B</Button>
      </Tooltip>
      <Modal open={state(false)} title="X">
        Y
      </Modal>
    </>
  ))
  await flush()
  expect(
    c.querySelector('[data-scope="popover"][data-part="content"]')!.getAttribute('popover'),
  ).toBe('manual')
  expect(c.querySelector('[role="tooltip"]')!.getAttribute('popover')).toBe('manual')
  const dlg = c.querySelector('dialog')!
  expect(dlg.hasAttribute('open')).toBe(false)
  expect(dlg.hasAttribute('data-presentation')).toBe(false)
})
