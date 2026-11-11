import { fireEvent } from '@testing-library/dom'
import { state } from '@kerf-js/core'
import { flush, render } from '@kerf-js/core/test'
import { type AgentQuestion } from '@kerf-js/veneer-core'
import { Toaster } from '../../src/Toast'
import { Question } from '../../src/agent/Question'
import { wait } from '../timers.mjs'
import { said } from './support'

export function registerQuestionAFieldsetSingleChoice() {
  test('Question: a fieldset, single choice by default, free text, and read back once answered', async () => {
    const got: unknown[] = []
    const q = state<AgentQuestion>({ id: 'q', prompt: 'Which?', options: ['a', 'b'], free: true })
    const { container: c } = render(() => (
      <>
        <Toaster />
        <Question question={q.value} onAnswer={(a) => got.push(a)} />
      </>
    ))
    await flush()
    await wait()
    expect(said(c, true)).toContain('question')
    expect(c.querySelector('legend')!.textContent).toBe('Which?')
    expect(c.textContent).toContain('Waiting for you')
    const radios = c.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    expect(radios[0]!.checked).toBe(true)
    radios[2]!.click()
    await flush()
    const text = c.querySelector<HTMLInputElement>('input[data-part="input"]')!
    text.value = 'c'
    fireEvent.input(text)
    await flush()
    fireEvent.submit(c.querySelector('form')!)
    expect(got).toEqual(['c'])
    q.value = { ...q.value, answer: 'c' }
    await flush()
    expect(c.querySelector('form')).toBeNull()
    expect(c.textContent).toContain('You chose: c')
  })
  test('a multiple question gives every pick; a question closed by Stop is disabled', async () => {
    const got: unknown[] = []
    const { container: c } = render(() => (
      <>
        <Question
          quiet
          question={{ id: 'm', prompt: 'P', options: ['a', 'b'], multiple: true }}
          onAnswer={(a) => got.push(a)}
        />
        <Question quiet question={{ id: 'n', prompt: 'Q', options: ['a'], closed: true }} />
      </>
    ))
    const boxes = c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    boxes[0]!.click()
    boxes[1]!.click()
    await flush()
    fireEvent.submit(c.querySelector('form')!)
    expect(got).toEqual([['a', 'b']])
    expect(c.querySelectorAll('fieldset')[1]!.disabled).toBe(true)
  })
}
