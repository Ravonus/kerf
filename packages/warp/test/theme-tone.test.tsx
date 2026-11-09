import { state } from '@weft-js/core'
import { render } from '@weft-js/core/test'
import { Button, type Tone } from '../src/Button'
import { Badge } from '../src/Badge'
import { Link } from '../src/Type'
import { Nav } from '../src/Nav'
import { Pill, PillLink } from '../src/Pill'

const semantic: Tone = 'critical'
// @ts-expect-error Unrelated consumers retain the finite semantic union.
const invalid: Tone = 'ocean'
void invalid

test('emits semantic and named tones, and leaves omitted tones absent', () => {
  const { container } = render(() => (
    <>
      <Button tone={semantic}>Save</Button>
      <Badge tone="ocean">New</Badge>
      <Link href="/" tone="brand">
        Link
      </Link>
      <Nav label="Main" tone="ocean" />
      <Pill tone="accent">Filter</Pill>
      <PillLink href="/" tone="ocean">
        Go
      </PillLink>
      <Button>Default</Button>
      <Badge>Default</Badge>
      <Link href="/">Default</Link>
      <Nav label="Default" />
      <Pill>Default</Pill>
      <PillLink href="/">Default</PillLink>
    </>
  ))
  const nodes = [
    ...container.querySelectorAll(
      '[data-scope="button"], [data-scope="badge"], [data-scope="link"], [data-scope="nav"], [data-scope="pill"]',
    ),
  ]
  expect(nodes.map((node) => node.getAttribute('data-tone'))).toEqual([
    'critical',
    'ocean',
    'brand',
    'ocean',
    'accent',
    'ocean',
    null,
    null,
    null,
    null,
    null,
    null,
  ])
  expect(nodes[4]?.tagName).toBe('BUTTON')
  expect(nodes[5]?.tagName).toBe('A')
})

test('updates named tones on existing hosts without inline CSS', () => {
  const tone = state('ocean')
  const { container } = render(() => (
    <>
      <Button tone={tone.value}>Save</Button>
      <Badge tone={tone.value}>New</Badge>
      <Link href="/" tone={tone.value}>
        Link
      </Link>
      <Nav label="Main" tone={tone.value} />
      <Pill tone={tone.value}>Filter</Pill>
      <PillLink href="/" tone={tone.value}>
        Go
      </PillLink>
    </>
  ))
  const nodes = [...container.querySelectorAll('[data-tone]')]
  tone.value = 'sunset'
  expect(nodes).toHaveLength(6)
  expect(
    nodes.map((node) => [
      node.tagName,
      node.getAttribute('data-scope'),
      node.getAttribute('data-tone'),
    ]),
  ).toEqual([
    ['BUTTON', 'button', 'sunset'],
    ['SPAN', 'badge', 'sunset'],
    ['A', 'link', 'sunset'],
    ['NAV', 'nav', 'sunset'],
    ['BUTTON', 'pill', 'sunset'],
    ['A', 'pill', 'sunset'],
  ])
  expect(nodes.every((node) => node.getAttribute('data-tone') === 'sunset')).toBe(true)
  expect([...container.querySelectorAll('[data-tone]')]).toEqual(nodes)
  expect(nodes.every((node) => !node.hasAttribute('style'))).toBe(true)
})

test('pills preserve native button and link behavior with a decorative sweep', () => {
  const clicked = vi.fn()
  const { container } = render(() => (
    <>
      <Pill onClick={clicked} aria-pressed="true">
        Filter
      </Pill>
      <Pill disabled onClick={clicked}>
        Disabled
      </Pill>
      <Pill type="submit">Submit</Pill>
      <PillLink href="/next" aria-current="page" target="_blank">
        Next
      </PillLink>
    </>
  ))
  const [button, disabled, submit] = container.querySelectorAll('button')
  const link = container.querySelector('a')!
  for (const host of [button!, disabled!, submit!, link]) {
    expect(host.hasAttribute('data-sweep')).toBe(true)
    expect(host.querySelector(':scope > [data-part="sweep"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
    expect(host.hasAttribute('data-tone')).toBe(false)
  }
  expect(button!.type).toBe('button')
  expect(button!.getAttribute('aria-pressed')).toBe('true')
  expect(submit!.type).toBe('submit')
  button!.click()
  disabled!.click()
  expect(clicked).toHaveBeenCalledTimes(1)
  expect(link.getAttribute('href')).toBe('/next')
  expect(link.getAttribute('aria-current')).toBe('page')
  expect(link.target).toBe('_blank')
})
