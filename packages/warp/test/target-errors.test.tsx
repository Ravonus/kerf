// Page errors from the QA sweep: a listener given something other than the Element it assumed.
import { fireEvent } from '@testing-library/dom'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flush, render } from 'weft/test'
import { Kanban } from '../src/collab/Kanban'
import { Select } from '../src/Select'
import { RichTextEditor } from '../src/RichTextEditor'

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms))
const settle = async () => { await tick(); await flush(); await tick(); await flush() }

// A throw in a listener reaches window's error event, not the test.
function caught() {
  const errors: string[] = []
  const hear = (e: ErrorEvent) => { errors.push(e.message); e.preventDefault() }
  window.addEventListener('error', hear)
  onTestFinished(() => window.removeEventListener('error', hear))
  return errors
}

describe('page errors from a target that is not an Element', () => {
  test('a resize with a Select open: the window is not a node', async () => {
    const errors = caught()
    const { container: c } = render(() => <Select label="Plan" value="a" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />)
    document.body.append(c)
    await settle()
    fireEvent.click(c.querySelector('[role="combobox"]')!)
    await settle()
    window.dispatchEvent(new Event('resize'))
    expect(errors).toEqual([])
  })

  test('typing in an editor whose text sits directly in it: the block is a Text', async () => {
    const errors = caught()
    const { container: c } = render(() => <RichTextEditor label="Notes" value="" />)
    document.body.append(c)
    await settle()
    const ed = c.querySelector<HTMLElement>('[contenteditable]')!
    ed.textContent = 'hello'
    getSelection()!.collapse(ed.firstChild, 5)
    ed.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'o' }))
    expect(errors).toEqual([])
  })

  test('dragging selected text in a Kanban card: dragstart lands on the Text', async () => {
    const errors = caught()
    const { container: c } = render(() => <Kanban columns={[{ id: 'a', title: 'A', cards: [{ id: '1', title: 'One' }] }]} onMove={() => {}} />)
    document.body.append(c)
    await settle()
    const text = document.createTreeWalker(c.querySelector('[data-part="card"]')!, NodeFilter.SHOW_TEXT).nextNode()!
    text.dispatchEvent(new Event('dragstart', { bubbles: true }))
    expect(errors).toEqual([])
  })

  test('no handler reads closest straight off an event target', () => {
    const src = join(process.cwd(), 'src'), core = join(process.cwd(), '../warp-core/src')
    const files = [src, core].flatMap(dir => (readdirSync(dir, { recursive: true }) as string[]).filter(f => /\.tsx?$/.test(f) && !/(^|\/)dither\//.test(f) && !/Dither/.test(f) && !(dir === core && f === 'flow.ts')).map(f => join(dir, f)))
    const bad = files.flatMap(f => readFileSync(f, 'utf8').split('\n').map((l, i) => [l, i] as const).filter(([l]) => /\.target as [^)]+\)\.closest[(<]/.test(l)).map(([, i]) => `${f}:${i + 1}`))
    expect(bad).toEqual([])
  })
})
