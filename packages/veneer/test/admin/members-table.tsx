import { fireEvent } from '@testing-library/dom'
import { state } from '@kerf/core'
import { render } from '@kerf/core/test'
import { MembersTable, type Member } from '../../src/admin/Members'
import { Toaster } from '../../src/Toast'
import { INVITES, PEOPLE, ROLES } from '../fixtures/pack-admin'
import { byText, dialog, pick, tick, toasts, type } from './support'

function suiteContext() {
  const mount = (seats = 10, members: Member[] = PEOPLE) => {
    const people = state<readonly Member[]>(members)
    const log: unknown[] = []
    const view = render(() => (
      <>
        <MembersTable
          members={people}
          invites={INVITES}
          me="ines"
          roles={ROLES}
          seats={seats}
          onRoleChange={(m, role) => {
            log.push(['role', m.id, role])
            people.value = people.value.map((x) => (x.id === m.id ? { ...x, role } : x))
          }}
          onRemove={(l) => {
            log.push(['rm', l.map((m) => m.id)])
            people.value = people.value.filter((x) => !l.some((y) => y.id === x.id))
          }}
          onRestore={(l) => {
            log.push(['back'])
            people.value = [...people.value, ...l]
          }}
          onInvite={(e, r) => {
            log.push(['inv', e, r])
          }}
        />
        <Toaster />
      </>
    ))
    return { c: view.container, log, people }
  }
  const select = (c: HTMLElement, id: string) =>
    c.querySelector<HTMLElement>(`tr[data-id="${id}"] [role="combobox"]`)!
  return { mount, select }
}

function registerSeatsCountPendingInvites(ctx: ReturnType<typeof suiteContext>) {
  const { mount, select } = ctx
  test('seats count pending invites', () => {
    expect(mount().c.textContent).toContain('5 of 10 seats used')
  })
  test('a role change applies at once with Undo', async () => {
    const { c, log } = mount()
    await tick()
    pick(select(c, 'tomas'), 'Viewer')
    await tick()
    expect(log).toEqual([['role', 'tomas', 'viewer']])
    expect(toasts()).toContain('Tomás Reyes is now Viewer')
    byText(document.body, 'Undo').click()
    await tick()
    expect(log.at(-1)).toEqual(['role', 'tomas', 'admin'])
  })
  test('the last owner can’t be demoted, and the select says why', async () => {
    const { c, log } = mount()
    await tick()
    const s = select(c, 'ines')
    expect(document.getElementById(s.getAttribute('aria-describedby')!)!.textContent).toMatch(
      /only owner/,
    )
    pick(s, 'Viewer')
    await tick()
    expect(s.textContent).toBe('Owner')
    expect(log).toEqual([])
  })
  test('demoting yourself warns', async () => {
    const { c, log } = mount(10, [PEOPLE[0]!, { ...PEOPLE[1]!, role: 'owner' }])
    await tick()
    pick(select(c, 'ines'), 'Member')
    await tick()
    expect(dialog().textContent).toMatch(/lose access to this page/)
    expect(log).toEqual([])
    byText(dialog(), 'Change my role').click()
    await tick()
    expect(log).toEqual([['role', 'ines', 'member']])
  })
  test('bulk: the bar counts who can go, one dialog, one Undo for the batch', async () => {
    const { c, log, people } = mount()
    for (const id of ['ines', 'priya', 'jonas'])
      c.querySelector<HTMLInputElement>(`tr[data-id="${id}"] [data-part="select"] input`)!.click()
    await tick()
    byText(c, 'Remove 2 members').click()
    await tick()
    byText(dialog(), 'Remove 2 members').click()
    await tick()
    expect(log).toEqual([['rm', ['priya', 'jonas']]])
    expect(toasts()).toContain('2 members removed')
    byText(document.body, 'Undo').click()
    await tick()
    expect(people.value.length).toBe(4)
  })
}

function registerInvitePasteInvalidTagAnd(ctx: ReturnType<typeof suiteContext>) {
  const { mount } = ctx
  test('invite: paste, invalid tag and seat check block sending, one message', async () => {
    const { c, log } = mount(6)
    byText(c, 'Invite people').click()
    await tick()
    const d = dialog()
    const input = d.querySelector<HTMLInputElement>('input')!
    fireEvent.paste(input, { clipboardData: { getData: () => 'a@x.dev, nope' } })
    await tick()
    byText(d, 'Send invites').click()
    await tick()
    expect(d.querySelector('[data-part="error"]')!.textContent).toMatch(
      /“nope” isn't a valid email/,
    )
    byText(d, 'Remove nope').click()
    await tick()
    type(input, 'b@x.dev')
    fireEvent.keyDown(input, { key: 'Enter' })
    await tick()
    byText(d, 'Send invites').click()
    await tick()
    expect(d.querySelector('[data-part="error"]')!.textContent).toMatch(
      /You have 1 seat left. Remove 1/,
    )
    byText(d, 'Remove b@x.dev').click()
    await tick()
    byText(d, 'Send invites').click()
    await tick()
    expect(log).toEqual([['inv', ['a@x.dev'], 'admin']].map((x) => [x[0], x[1], 'member']))
    expect(toasts()).toContain('Invite sent')
  })
}

export function registerMembersTable() {
  describe('MembersTable', () => {
    const ctx = suiteContext()
    registerSeatsCountPendingInvites(ctx)
    registerInvitePasteInvalidTagAnd(ctx)
  })
}
