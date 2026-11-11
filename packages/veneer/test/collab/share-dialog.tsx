import { fireEvent } from '@testing-library/dom'
import { state } from '@kerf-js/core'
import { flush, render } from '@kerf-js/core/test'
import { Toaster } from '../../src/Toast'
import { ShareDialog, type ShareLink, type ShareMember } from '../../src/collab/ShareDialog'
import { wait } from '../timers.mjs'
import { ana, button, me, mei, polite, q, qa, tick, type } from './support'

function suiteContext() {
  const setup = () => {
    const open = state(true)
    const members = state<ShareMember[]>([
      { ...me, email: 'jo@x', role: 'owner' },
      { ...mei, email: 'mei@x', role: 'editor' },
    ])
    const link = state<ShareLink>({ access: 'restricted', role: 'viewer' })
    const log: unknown[] = []
    const { container: c } = render(() => (
      <>
        <ShareDialog
          open={open}
          title="Q4"
          members={members}
          link={link}
          url="https://x"
          onInvite={(e, r) => log.push(['invite', e, r])}
          onRoleChange={(m, r) => log.push(['role', m.id, r])}
          onLinkAccess={(l) => {
            link.value = l
            log.push(['link', l.access])
          }}
        />
        <Toaster />
      </>
    ))
    return { c, members, log, open }
  }
  return { setup }
}

function registerInvitesByEmailWithThe(ctx: ReturnType<typeof suiteContext>) {
  const { setup } = ctx
  test('invites by email with the chosen role; invited rows arrive', async () => {
    const { c, members, log } = setup()
    await tick()
    const input = q<HTMLInputElement>(c, '[data-scope="field"] input')
    type(input, 'new@x.co')
    await flush()
    fireEvent.submit(q(c, 'form'))
    await flush()
    expect(q(c, '[data-scope="tag"]').textContent).toContain('new@x.co')
    button(c, 'Invite').click()
    expect(log).toEqual([['invite', ['new@x.co'], 'editor']])
    await flush()
    expect(c.querySelector('[data-scope="tag"]')).toBeNull()
    members.value = [...members.value, { ...ana, email: 'new@x.co', role: 'editor' }]
    await flush()
    expect(qa(c, '[data-part="person"]')[2]!.hasAttribute('data-arrive')).toBe(true)
    expect(qa(c, '[data-part="person"]')[1]!.hasAttribute('data-arrive')).toBe(false)
  })
  test('the owner has no select; a role change and Remove report; link access opens its role', async () => {
    const { c, log } = setup()
    await tick()
    const people = qa(c, '[data-part="person"]')
    expect(people[0]!.querySelector('[role="combobox"]')).toBeNull()
    const sel = q<HTMLElement>(people[1]!, '[role="combobox"]')
    expect(sel.textContent).toBe('Editor')
    const pick = (t: HTMLElement, label: string) => {
      t.click()
      ;[...t.parentElement!.querySelectorAll<HTMLElement>('[role="option"]')]
        .find((o) => o.textContent === label)!
        .click()
    }
    pick(sel, 'Viewer')
    pick(sel, 'Remove')
    expect(log).toEqual([
      ['role', 'mei', 'viewer'],
      ['role', 'mei', null],
    ])
    pick(q<HTMLElement>(c, '[data-part="link"] [role="combobox"]'), 'Anyone with link')
    await flush()
    expect(qa(c, '[data-part="link"] [role="combobox"]').length).toBe(2)
  })
  test('Copy link confirms and announces', async () => {
    const { c } = setup()
    await tick()
    button(c, 'Copy link').click()
    await flush()
    await wait()
    expect(button(c, 'Copied')).toBeTruthy()
    expect(polite()).toBe('Link copied')
  })
}

export function registerShareDialog() {
  describe('ShareDialog', () => {
    const ctx = suiteContext()
    registerInvitesByEmailWithThe(ctx)
  })
}
