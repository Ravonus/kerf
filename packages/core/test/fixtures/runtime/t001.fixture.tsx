import { render } from '@kerf-js/core/test'

const Hello = () => <p>hello</p>

test('never asserts', () => {
  render(Hello)
})

test('asserts', () => {
  render(Hello)
  expect(document.body.textContent).toContain('hello')
})

test.fails('meant to fail', () => {
  throw new Error('expected')
})
