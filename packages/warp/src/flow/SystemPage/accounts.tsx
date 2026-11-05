import { PlusIcon } from '@weft-js/warp-icons'
import { menu, uid } from '@weft-js/warp-core'
import { state } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import { Avatar } from '../../parts'
import { Badge } from '../../Badge'
import type { SwitchAccount } from '../SystemPage'

export function AccountMenu({
  accounts,
  onSwitch,
}: {
  accounts: SwitchAccount[]
  onSwitch?: (id: string | undefined) => void
}) {
  const id = uid('accounts')
  const open = state(false)
  let list: HTMLElement | undefined
  use(
    menu,
    () => list,
    () => ({
      open: open.value,
      trigger: () => list?.parentElement?.querySelector<HTMLElement>('[data-switch]'),
      onClose: () => (open.value = false),
    }),
  )
  const pick = (a: string | undefined) => {
    open.value = false
    list?.parentElement?.querySelector<HTMLElement>('[data-switch]')?.focus()
    onSwitch?.(a)
  }
  return {
    open,
    id,
    press: () => (open.value = !open.value),
    menu: () => (
      <ul
        ref={(n) => (list = n)}
        data-part="accounts"
        role="menu"
        id={id}
        aria-label="Switch account"
        hidden={!open.value || undefined}
      >
        {accounts.map((a) => (
          <li key={a.id} role="none">
            <button type="button" role="menuitem" tabindex="-1" onClick={() => pick(a.id)}>
              <Avatar name={a.email} size="sm" />
              <span>
                {a.email}
                {a.detail && <small>{a.detail}</small>}
              </span>
              {a.hasAccess ? (
                <Badge tone="positive">Has access</Badge>
              ) : a.current ? (
                <small>Current</small>
              ) : (
                <span></span>
              )}
            </button>
          </li>
        ))}
        <li role="none">
          <button type="button" role="menuitem" tabindex="-1" onClick={() => pick(undefined)}>
            <PlusIcon />
            <span>Use another account</span>
            <span></span>
          </button>
        </li>
      </ul>
    ),
  }
}
