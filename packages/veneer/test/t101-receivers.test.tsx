import { fireEvent } from '@testing-library/dom'
import { state } from '@kerf/core'
import { flush, render } from '@kerf/core/test'
import { SaveBar, type SaveBarProps } from '../src/admin/SaveBar'
import { TagsInput, type TagsInputProps } from '../src/admin/TagsInput'

const tick = async () => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
  await flush()
}
const button = (root: ParentNode, name: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(name))!

beforeAll(() => {
  if (!Reflect.get(HTMLDialogElement.prototype, 'showModal'))
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '')
      },
      configurable: true,
    })
  if (!Reflect.get(HTMLDialogElement.prototype, 'close'))
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      value(this: HTMLDialogElement) {
        this.removeAttribute('open')
      },
      configurable: true,
    })
})

afterEach(() => {
  document.body.innerHTML = ''
})

test('SaveBar reads current callbacks with the original receiver', async () => {
  const values = state({ name: 'one' })
  const seen: unknown[] = []
  const first = vi.fn()
  const props: SaveBarProps<{ name: string }> = { values, onSave: first }
  const view = render(() => (
    <div>
      <a href="/away">Away</a>
      {SaveBar(props)}
    </div>
  ))
  document.body.append(view.container)
  values.value = { name: 'two' }
  await tick()
  props.validate = function (this: unknown, now) {
    seen.push(['validate', this, now])
    return {}
  }
  props.onSave = function (this: unknown, now) {
    seen.push(['save', this, now])
    return Promise.resolve()
  }
  button(view.container, 'Save changes').click()
  await tick()
  expect(first).not.toHaveBeenCalled()
  expect(seen).toEqual([
    ['validate', props, values.value],
    ['save', props, values.value],
  ])
  values.value = { name: 'three' }
  await tick()
  props.onDiscard = function (this: unknown) {
    seen.push(['discard', this])
  }
  button(view.container, 'Discard').click()
  await tick()
  expect(seen.at(-1)).toEqual(['discard', props])
  values.value = { name: 'four' }
  props.onLeave = function (this: unknown, href) {
    seen.push(['leave', this, href])
  }
  await tick()
  view.container.querySelector('a')!.click()
  await tick()
  button(document, 'Discard and leave').click()
  await tick()
  expect(seen.slice(-2)).toEqual([
    ['discard', props],
    ['leave', props, '/away'],
  ])
})

test('TagsInput uses current edit and submit callbacks for add, drop and empty Enter', async () => {
  const calls: unknown[] = []
  const old = vi.fn()
  const value = state<string[]>([])
  const props: TagsInputProps = { label: 'Tags', value, onEdit: old }
  const view = render(() => TagsInput(props))
  const input = view.container.querySelector('input')!
  props.onEdit = function (this: unknown) {
    calls.push(['edit', this])
  }
  props.onSubmit = function (this: unknown) {
    calls.push(['submit', this])
  }
  fireEvent.input(input, { target: { value: 'one' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await tick()
  fireEvent.keyDown(input, { key: 'Backspace' })
  fireEvent.keyDown(input, { key: 'Backspace' })
  await tick()
  fireEvent.keyDown(input, { key: 'Enter' })
  await tick()
  expect(old).not.toHaveBeenCalled()
  expect(calls).toEqual([
    ['edit', props],
    ['edit', props],
    ['submit', props],
  ])
})

test('callback getters capture their result once and optional absence stays absent', async () => {
  const values = state({ name: 'one' })
  const order: string[] = []
  const props: SaveBarProps<{ name: string }> = { values, onSave: () => {} }
  Object.defineProperty(props, 'validate', {
    configurable: true,
    get() {
      order.push('get validate')
      Object.defineProperty(props, 'validate', {
        configurable: true,
        value: () => {
          throw new Error('replacement')
        },
      })
      return function (this: unknown, now: { name: string }) {
        expect(this).toBe(props)
        expect(now).toEqual({ name: 'two' })
        order.push('validate')
        return {}
      }
    },
  })
  Object.defineProperty(props, 'onSave', {
    configurable: true,
    get() {
      order.push('get save')
      return function (this: unknown) {
        expect(this).toBe(props)
        order.push('save')
      }
    },
  })
  const view = render(() => SaveBar(props))
  values.value = { name: 'two' }
  await tick()
  button(view.container, 'Save changes').click()
  await tick()
  expect(order).toEqual(['get validate', 'validate', 'get save', 'save'])

  const tags: TagsInputProps = { label: 'Optional', value: state<string[]>([]) }
  let reads = 0
  Object.defineProperty(tags, 'onSubmit', {
    configurable: true,
    get() {
      reads++
      return undefined
    },
  })
  const other = render(() => TagsInput(tags))
  fireEvent.keyDown(other.container.querySelector('input')!, { key: 'Enter' })
  expect(reads).toBe(1)
})
