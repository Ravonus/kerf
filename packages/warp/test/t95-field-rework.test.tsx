// Original Field invocation, getter-order, identity and cleanup controls.
import { onCleanup, getOwner, state } from '@weft-js/core'
import { resetIds } from '@weft-js/warp-core'
import { render, flush } from '@weft-js/core/test'
import { Field, type Control } from '../src/Field'
import { sleep as tick } from '../../../scripts/lib/sleep.mjs'

type Input = Parameters<typeof Field>[0]
const expectedReads = [
  'id',
  'reset',
  'variant',
  'appearance',
  'size',
  'size',
  'counter',
  'error',
  'attrs',
  'icon',
  'filled',
  'hold',
  'wrap',
  'group',
  'labelled',
  'group',
  'labelled',
  'label',
  'label',
  'prefix',
  'group',
  'control',
  'suffix',
  'clearable',
  'end',
  'hint',
  'counter',
  'label',
  'label',
  'label',
  'label',
  'hint',
  'hint',
  'hint',
  'counter',
  'label',
]
beforeEach(() => resetIds())

test('Field keeps the original control receiver, DOM return and live keyed label', async () => {
  const reads: string[] = []
  const lifetime: string[] = []
  const input = document.createElement('input')
  let change!: () => void
  let props!: Input
  let calls = 0
  const { container: c, unmount } = render(() => {
    const label = state('Alpha')
    const hint = state<string | undefined>(undefined)
    change = () => {
      label.value = 'Alpine'
      hint.value = 'Help'
    }
    const target: Input = {
      get label() {
        return label.value
      },
      get hint() {
        return hint.value
      },
      control(this: unknown, shell) {
        expect(this).toBe(props)
        expect(shell.id).toMatch(/^field-/)
        expect(getOwner()).toBeTruthy()
        calls++
        lifetime.push('control')
        onCleanup(() => lifetime.push('cleanup'))
        return input
      },
    }
    props = new Proxy(target, {
      get(object, key, receiver) {
        if (typeof key === 'string') reads.push(key)
        return Reflect.get(object, key, receiver)
      },
    })
    return Field(props)
  })
  await flush()
  const firstLetter = c.querySelector('[data-char]')
  expect(c.querySelector('input')).toBe(input)
  input.focus()
  change()
  await flush()
  expect(c.querySelector('[data-part="label-text"]')?.textContent).toBe('Alpine')
  expect(c.querySelector('[data-char]')).toBe(firstLetter)
  expect(c.querySelector('input')).toBe(input)
  expect(document.activeElement).toBe(input)
  expect(calls).toBe(1)
  expect(lifetime).toEqual(['control'])
  unmount()
  expect(lifetime).toEqual(['control', 'cleanup'])
  expect(reads).toEqual(expectedReads)
})

test('Field captures a control lookup before invocation and replaces it live on group change', async () => {
  const trace: string[] = []
  const oldNode = document.createElement('input')
  const newNode = document.createElement('input')
  let flip!: () => void
  let props!: Input
  const replacement: Control = function (this: unknown, shell) {
    expect(this).toBe(props)
    expect(shell.rest['data-proof']).toBe('live')
    trace.push('new')
    return newNode
  }
  let callback: Control = function (this: unknown, shell) {
    expect(this).toBe(props)
    expect(shell.rest['data-proof']).toBe('live')
    trace.push('old')
    return oldNode
  }
  const { container: c } = render(() => {
    const group = state(false)
    flip = () => {
      group.value = true
    }
    props = {
      label: 'Name',
      'data-proof': 'live',
      get group() {
        return group.value
      },
      get control() {
        trace.push('lookup')
        const found = callback
        callback = replacement
        return found
      },
    }
    return Field(props)
  })
  await flush()
  expect(trace).toEqual(['lookup', 'old'])
  expect(c.querySelector('input')).toBe(oldNode)
  flip()
  await flush()
  expect(trace).toEqual(['lookup', 'old', 'lookup', 'new'])
  expect(c.querySelector('input')).toBe(newNode)
})

test('Field reset keeps its live receiver and propagates the callback promise', async () => {
  const seen: unknown[] = []
  const marker = new Error('reset rejection')
  const failed = Promise.reject(marker)
  const handled = failed.catch((error: unknown) => seen.push(error))
  let fn: () => unknown = () => {
    throw new Error('stale reset')
  }
  const props: Input = {
    label: 'Name',
    control: () => <input />,
    get reset() {
      return fn
    },
  }
  const { container: c } = render(() => <form>{Field(props)}</form>)
  await flush()
  fn = function (this: unknown) {
    seen.push(this)
    return failed
  }
  c.querySelector('form')!.reset()
  await tick()
  await flush()
  await handled
  expect(seen).toEqual([marker, props])
})

test('Field leaves an initially absent reset callback absent', async () => {
  const seen: unknown[] = []
  const props: Input = { label: 'Name', control: () => <input /> }
  const { container: c } = render(() => <form>{Field(props)}</form>)
  await flush()
  props.reset = function (this: unknown) {
    seen.push(this)
  }
  c.querySelector('form')!.reset()
  await tick()
  await flush()
  expect(seen).toEqual([])
})

test('Field keeps disabled, required, error and hint reads live', async () => {
  let update!: () => void
  const { container: c } = render(() => {
    const disabled = state(false)
    const required = state(false)
    const error = state<string | undefined>(undefined)
    const hint = state('Help')
    update = () => {
      disabled.value = true
      required.value = true
      error.value = 'Invalid'
      hint.value = 'Updated'
    }
    const props: Input = {
      label: 'Name',
      get disabled() {
        return disabled.value
      },
      get required() {
        return required.value
      },
      get error() {
        return error.value
      },
      get hint() {
        return hint.value
      },
      control(shell) {
        return <input disabled={!!shell.rest.disabled} required={!!shell.rest.required} />
      },
    }
    return Field(props)
  })
  await flush()
  const input = c.querySelector('input')!
  expect([input.disabled, input.required]).toEqual([false, false])
  expect(c.textContent).toContain('Help')
  update()
  await flush()
  expect(c.querySelector('input')).toBe(input)
  expect([input.disabled, input.required]).toEqual([true, true])
  expect(c.querySelector('[data-scope="field"]')!.hasAttribute('data-invalid')).toBe(true)
  expect(c.textContent).toContain('Invalid')
})
