// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { capture } from '../src/capture'

type Q = { q: Event[]; p(e: Event): void; s?: 1 }

it('a page that hydrates whole holds a click made before its code runs, and replays it once it does', () => {
  document.body.innerHTML =
    '<button>menu</button><a href="/menu">menu</a><div wk><i>island</i></div>'
  window.matchMedia ??= (() => ({ matches: false })) as unknown as typeof matchMedia
  // oxlint-disable-next-line no-new-func, no-implied-eval -- capture() is the page's inline script: running its source text as the page would is the test
  new Function(capture(true))()
  const q = (window as Window & { __wq?: Q }).__wq!
  const button = document.querySelector('button')!
  const early = new MouseEvent('click', { bubbles: true, cancelable: true })
  button.dispatchEvent(early)
  // held: nothing on the page listens yet, so the click waits for the code
  expect(early.defaultPrevented).toBe(true)
  expect(q.q).toEqual([early])
  // a plain link works without code: the browser follows it
  const link = new MouseEvent('click', { bubbles: true, cancelable: true })
  document.querySelector('a')!.dispatchEvent(link)
  expect(link.defaultPrevented).toBe(false)
  expect(q.q).toHaveLength(1)
  // only clicks, submits and resets are held off the islands; typing has already happened in the DOM
  button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
  expect(q.q).toHaveLength(1)
  // the code runs: the handler hears the replay, and later clicks go straight through
  let heard = 0
  button.addEventListener('click', () => heard++)
  q.s = 1
  q.p(q.q.shift()!)
  expect(heard).toBe(1)
  const late = new MouseEvent('click', { bubbles: true, cancelable: true })
  button.dispatchEvent(late)
  expect(late.defaultPrevented).toBe(false)
  expect(heard).toBe(2)
  expect(q.q).toHaveLength(0)
})
