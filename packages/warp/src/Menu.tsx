import { menu, moveShuttle, uid, type Align, type Side } from '@weft-js/warp-core'
import { onCleanup, onMount, state } from '@weft-js/core'
import { Button, type ButtonProps } from './Button'
import { Icon, type IconRef } from './Icon'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/components/menu.css'

/** One line of a Menu: an item, a group label or a separator. */
export type MenuEntry =
  | {
      label: string
      onSelect?: () => void
      icon?: IconRef | undefined
      shortcut?: string
      tone?: 'critical' | undefined
      disabled?: boolean | undefined
      href?: string
    }
  | { separator: true }
  | { group: string }

const Row = ({ e }: { e: Extract<MenuEntry, { label: string }> }) => (
  <>
    {e.icon && <Icon name={e.icon} />}
    <span data-part="item-label">{e.label}</span>
    {e.shortcut && <span data-part="shortcut">{e.shortcut}</span>}
  </>
)

/** Props for Menu. */
export interface MenuProps {
  /** The trigger's text. */
  label: unknown
  items: MenuEntry[]
  trigger?: ButtonProps | undefined
  side?: Side | undefined
  align?: Align
}

type MenuSyncContext = {
  button: () => HTMLButtonElement | undefined
  face: () => HTMLElement | undefined
  side: () => Side
  align: () => Align
  close: () => void
}

function menuSync(ctx: MenuSyncContext) {
  // the panel is shown before menu() moves focus in, so the first move lands without travelling
  return (el: HTMLElement, o: { open: boolean; at: 'first' | 'last' }) => {
    const opts = () => ({
      open: o.open,
      at: o.at,
      trigger: () => ctx.button(),
      side: ctx.side(),
      align: ctx.align(),
      onClose: ctx.close,
    })
    if (o.open) el.showPopover?.()
    const m = menu(el, opts())
    return {
      update(n: typeof o) {
        o = n
        if (n.open && !el.matches(':popover-open')) el.showPopover?.()
        m.update(opts())
        if (!n.open && el.matches(':popover-open')) el.hidePopover?.()
        if (n.open)
          requestAnimationFrame(() =>
            requestAnimationFrame(() => ctx.face()?.removeAttribute('data-instant')),
          )
      },
      destroy() {
        m.destroy()
      },
    }
  }
}

function menuState(side: () => Side, align: () => Align) {
  const id = uid('menu')
  const open = state(false)
  const at = state<'first' | 'last'>('first')
  let button: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  let face: HTMLElement | undefined
  const close = () => (open.value = false)
  const follow = (el: HTMLElement) => {
    moveShuttle(face!, el.offsetTop, el.offsetTop + el.offsetHeight)
    face!.setAttribute('data-on', '')
  }
  onMount(() => {
    const onToggle = (e: ToggleEvent) => {
      if (e.newState === 'open') face!.setAttribute('data-instant', '')
      else {
        face!.removeAttribute('data-on')
        face!.style.removeProperty('--warp-a')
      }
    }
    panel!.addEventListener('beforetoggle', onToggle)
    onCleanup(() => panel!.removeEventListener('beforetoggle', onToggle))
  })
  const syncOpen = menuSync({ button: () => button, face: () => face, side, align, close })
  use(
    syncOpen,
    () => panel,
    () => ({ open: open.value, at: at.value }),
  )
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    at.value = e.key === 'ArrowUp' ? 'last' : 'first'
    open.value = true
  }
  const pick = (e: { onSelect?: () => void }) => {
    close()
    button?.focus()
    e.onSelect?.()
  }
  return [
    id,
    open,
    at,
    follow,
    onKey,
    pick,
    (el: HTMLButtonElement) => (button = el),
    (el: HTMLDivElement) => (panel = el),
    (el: HTMLElement) => (face = el),
  ] as const
}

function pointMenu(e: PointerEvent) {
  const t = (e.target as HTMLElement).closest?.<HTMLElement>(
    '[role="menuitem"]:not([aria-disabled="true"])',
  )
  if (t && t !== document.activeElement) t.focus({ preventScroll: true })
}

/**
 * A menu button (05 §3, APG): the trigger holds its sweep while open and the panel opens from it. warp-core's menu() owns
 * focus, ↑/↓, Home/End, typeahead, Escape and Tab; the highlight is one shuttle that follows focus and the pointer.
 */
export function Menu({ label, items, trigger, side = 'bottom', align = 'start' }: MenuProps) {
  const [id, open, at, follow, onKey, pick, setButton, setPanel, setFace] = menuState(
    () => side,
    () => align,
  )
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        {...(trigger ?? {})}
        ref={(el: HTMLButtonElement) => setButton(el)}
        id={`${id}-b`}
        aria-haspopup="menu"
        aria-expanded={open.value ? 'true' : 'false'}
        aria-controls={id}
        onClick={() => {
          at.value = 'first'
          open.value = !open.value
        }}
        onKeyDown={onKey}
      >
        {label}
      </Button>
      <div
        ref={(n) => setPanel(n)}
        data-scope="menu"
        data-part="content"
        role="menu"
        popover="manual"
        id={id}
        aria-labelledby={`${id}-b`}
        onFocusIn={(e: FocusEvent) => {
          const t = (e.target as HTMLElement).closest?.<HTMLElement>('[role="menuitem"]')
          if (t) follow(t)
        }}
        onPointerMove={(e: PointerEvent) => pointMenu(e)}
      >
        <span ref={(n) => setFace(n)} data-part="shuttle" aria-hidden="true"></span>
        {items.map((e, i) =>
          'separator' in e ? (
            <div key={i} data-part="separator" role="separator"></div>
          ) : 'group' in e ? (
            <div key={i} data-part="group-label">
              {e.group}
            </div>
          ) : e.href && !e.disabled ? (
            <a
              key={i}
              href={e.href}
              data-part="item"
              role="menuitem"
              tabindex="-1"
              data-tone={e.tone}
              onClick={() => pick(e)}
            >
              <Row e={e} />
            </a>
          ) : (
            <div
              key={i}
              data-part="item"
              role="menuitem"
              tabindex="-1"
              data-tone={e.tone}
              aria-disabled={e.disabled ? 'true' : undefined}
              onClick={() => {
                if (!e.disabled) pick(e)
              }}
            >
              <Row e={e} />
            </div>
          ),
        )}
      </div>
    </>
  )
}
