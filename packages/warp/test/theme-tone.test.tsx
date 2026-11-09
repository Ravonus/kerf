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
  expect(nodes.every((node) => node.getAttribute('data-tone') === 'sunset')).toBe(true)
  expect(nodes.every((node) => !node.hasAttribute('style'))).toBe(true)
})
