import { fireEvent } from '@testing-library/dom'
import { render, flush } from '@kerf/core/test'
import { SpeechInput, type SpeechInputProps } from '../src/agent/SpeechInput'
import { ToolCall, type ToolCallProps } from '../src/agent/ToolCall'
import { Composer, type ComposerProps } from '../src/collab/Composer'
import { button, type } from './collab/support'

test('speech insertion uses the current callback and original receiver', async () => {
  const calls: unknown[] = []
  const props: SpeechInputProps = { mics: [], initial: { final: 'hello' }, onInsert() {} }
  const { container } = render(() => SpeechInput(props))
  await flush()
  props.onInsert = function (text) {
    calls.push(this, text)
  }
  button(container, 'Insert into message').click()
  expect(calls).toEqual([props, 'hello'])
})

test('tool approval and denial use the current callbacks and original receiver', async () => {
  const calls: unknown[] = []
  const props: ToolCallProps = {
    call: { id: 't', name: 'tool', args: 'first', state: 'approval' },
    quiet: true,
    alwaysAllow: 'Always',
    onApprove() {},
    onDeny() {},
  }
  const { container } = render(() => ToolCall(props))
  await flush()
  props.onApprove = function (args, always) {
    calls.push(this, args, always)
  }
  props.onDeny = function () {
    calls.push(this, 'deny')
  }
  type(container.querySelector('textarea')!, 'changed')
  container.querySelector<HTMLInputElement>('[data-part="approve"] input')!.click()
  button(container, 'Approve').click()
  button(container, 'Deny').click()
  expect(calls).toEqual([props, 'changed', true, props, 'deny'])
})

test('composer callbacks use the current callbacks and original receiver', async () => {
  const calls: unknown[] = []
  const file = { id: 'f', name: 'file' }
  const props: ComposerProps = {
    label: 'Message',
    files: [file],
    onSend() {},
    onRemoveFile() {},
    onAttach() {},
    onEmoji() {},
  }
  const { container } = render(() => Composer(props))
  await flush()
  props.onSend = function (message) {
    calls.push(this, message.text)
  }
  props.onRemoveFile = function (value) {
    calls.push(this, value)
  }
  props.onAttach = function () {
    calls.push(this, 'attach')
  }
  props.onEmoji = function (insert) {
    calls.push(this, 'emoji')
    insert('!')
  }
  button(container, 'Attach').click()
  button(container, 'Emoji').click()
  button(container, 'Remove file').click()
  const ta = container.querySelector('textarea')!
  type(ta, 'hello')
  fireEvent.keyDown(ta, { key: 'Enter' })
  expect(calls).toEqual([props, 'attach', props, 'emoji', props, file, props, 'hello'])
})

test('removal looks up the optional callback before reading the keyed file', async () => {
  const events: string[] = []
  const file = { id: 'f', name: 'file' }
  const callbacks: { current: ComposerProps['onRemoveFile'] } = { current: undefined }
  const props: ComposerProps = {
    label: 'Message',
    onSend() {},
    get files() {
      events.push('files')
      return [file]
    },
  }
  Object.defineProperty(props, 'onRemoveFile', {
    get() {
      events.push('callback')
      return callbacks.current
    },
  })
  const { container } = render(() => Composer(props))
  await flush()
  events.length = 0
  button(container, 'Remove file').click()
  expect(events).toEqual(['callback'])
  callbacks.current = function (this: unknown, value) {
    events.push(this === props && value === file ? 'called' : 'wrong')
  }
  events.length = 0
  button(container, 'Remove file').click()
  expect(events[0]).toBe('callback')
  expect(events.at(-1)).toBe('called')
})
