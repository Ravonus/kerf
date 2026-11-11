// A prop read in JSX stays live: changing it after mount updates the component. Each of these used to be an `untrack`
// snapshot taken in setup, which showed the first value for good.
import type { Peer } from '@kerf/veneer-core'
import { state } from '@kerf/core'
import { flush, render } from '@kerf/core/test'
import { SettingRow, SettingsSection } from '../src/admin'
import { LockedField } from '../src/collab'
import { Accordion, Button, Modal } from '../src/index'
import { Inbox, Prejoin, ScheduledLobby } from '../src/live'

const peer = { id: 'p', name: 'Kofi Mensah' } as Peer

const modalPlacement = async () => {
  const placement = state<'center' | 'top' | 'full'>('center')
  const { container: c } = render(() => (
    <Modal open={state(false)} title="Hi" placement={placement.value}>
      Body
    </Modal>
  ))
  const dialog = () => c.querySelector('dialog')!
  expect(dialog().hasAttribute('data-placement')).toBe(false)
  placement.value = 'top'
  await flush()
  expect(dialog().getAttribute('data-placement')).toBe('top')
}

const buttonEmphasis = async () => {
  const emphasis = state<'solid' | 'outline' | 'frame'>('solid')
  const { container: c } = render(() => (
    <Button emphasis={emphasis.value} fill>
      Go
    </Button>
  ))
  const button = () => c.querySelector('button')!
  expect(button().hasAttribute('data-emphasis')).toBe(false)
  expect(c.querySelector('[data-part="sweep"]')).not.toBeNull()
  emphasis.value = 'outline'
  await flush()
  expect(button().getAttribute('data-emphasis')).toBe('outline')
  expect(c.querySelector('[data-part="sweep"]')).not.toBeNull()
  expect(button().hasAttribute('data-fill')).toBe(false)
  emphasis.value = 'frame'
  await flush()
  expect(button().getAttribute('data-emphasis')).toBe('frame')
  expect(button().hasAttribute('data-fill')).toBe(true)
  expect(c.querySelector('[data-part="sweep"]')).toBeNull()
}

const accordionVariant = async () => {
  const variant = state<'line' | undefined>(undefined)
  const { container: c } = render(() => (
    <Accordion items={[{ value: 'a', title: 'One', content: 'first' }]} variant={variant.value} />
  ))
  const root = c.querySelector('[data-scope="accordion"]')!
  expect(root.hasAttribute('data-variant')).toBe(false)
  variant.value = 'line'
  await flush()
  expect(root.getAttribute('data-variant')).toBe('line')
}

const sectionHeading = async () => {
  const as = state<'h3' | 'h4'>('h3')
  const { container: c } = render(() => (
    <SettingsSection id="s" title="Team" as={as.value}>
      <SettingRow title="Name">x</SettingRow>
    </SettingsSection>
  ))
  expect(c.querySelector('h3')?.textContent).toBe('Team')
  as.value = 'h4'
  await flush()
  expect(c.querySelector('h3')).toBeNull()
  expect(c.querySelector('h4')?.textContent).toBe('Team')
}

const rowChildren = async () => {
  const text = state('one')
  const { container: c } = render(() => (
    <SettingRow title="Name">
      <i>{text.value}</i>
    </SettingRow>
  ))
  text.value = 'two'
  await flush()
  expect(c.querySelector('i')?.textContent).toBe('two')
}

const lockedFieldProps = async () => {
  const label = state('Title')
  const holder = state<Peer | null>(null)
  const { container: c } = render(() => <LockedField label={label.value} peer={holder.value} />)
  expect(c.textContent).toContain('Title')
  label.value = 'Heading'
  holder.value = peer
  await flush()
  expect(c.textContent).toContain('Heading')
  expect(c.querySelector('input')!.hasAttribute('readonly')).toBe(true)
  expect(c.textContent).toContain('Kofi is editing')
}

const inboxSettings = async () => {
  const settings = state<(() => void) | undefined>(undefined)
  const { container: c } = render(() => <Inbox items={[]} settings={settings.value} />)
  const gear = () => c.querySelector('[aria-label="Notification settings"]')
  expect(gear()).toBeNull()
  settings.value = () => {}
  await flush()
  expect(gear()).not.toBeNull()
}

const prejoinSound = async () => {
  const sound = state<(() => void) | undefined>(undefined)
  const { container: c } = render(() => <Prejoin onTestSound={sound.value} devices={{}} />)
  expect(c.textContent).not.toContain('Play test sound')
  let played = 0
  sound.value = () => played++
  await flush()
  const button = [...c.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Play test sound'),
  )!
  button.click()
  expect(played).toBe(1)
}

const lobbyCalendar = async () => {
  const add = state<(() => void) | undefined>(undefined)
  const { container: c } = render(() => (
    <ScheduledLobby title="Standup" to={Date.now() + 60_000} onAddToCalendar={add.value} />
  ))
  expect(c.textContent).not.toContain('Add to calendar')
  add.value = () => {}
  await flush()
  expect(c.textContent).toContain('Add to calendar')
}

describe('veneer props changed after mount', () => {
  test('Modal: placement sits on the dialog, and centre has no attribute', modalPlacement)
  test('Button: emphasis moves its attribute, its sweep and its frame', buttonEmphasis)

  test('Accordion: variant', accordionVariant)

  test('SettingsSection: its heading level', sectionHeading)

  test('SettingRow: a control that reads state from its children', rowChildren)

  test("LockedField: the field's own props", lockedFieldProps)

  test('Inbox: settings appears when the handler does', inboxSettings)

  test('Prejoin: the test sound button follows its prop', prejoinSound)

  test('ScheduledLobby: add to calendar appears when the handler does', lobbyCalendar)
})
