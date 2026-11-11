import { uid, shell, menu, dialog } from '@kerf-js/veneer-core'
import { derived, state, untrack } from '@kerf-js/core'
import { use } from '@kerf-js/veneer-core/kerf'
import { TABS, type ShellProps } from './shared'

function shellData(props: ShellProps) {
  const base = uid('shell')
  const main = `${base}-main`,
    navId = `${base}-nav`,
    menuId = `${base}-menu`,
    sheetId = `${base}-sheet`
  const focus = derived(() => (props.variant === undefined ? 'app' : props.variant) === 'focus')
  const folded = untrack(() => props.collapsed) ?? state<boolean | 'hidden'>(false)
  const navOpen = state(false)
  const wide = state(false)
  const menuOpen = state(false)
  const moreOpen = state(false)
  const refs = {
    from: null as HTMLElement | null,
    at: 'first' as 'first' | 'last',
    root: undefined as HTMLDivElement | undefined,
    menuEl: undefined as HTMLDivElement | undefined,
    sheetEl: undefined as HTMLDialogElement | undefined,
  }
  const groups = derived(() => props.nav ?? [])
  const primary = derived(() => {
    const items = groups.value[0]?.items ?? []
    const marked = items.some((i) => i.tab)
    return items.map((item, n) => ({ item, tab: marked ? !!item.tab : n < TABS }))
  })
  const extra = derived(() => groups.value.slice(1))
  const more = derived(() => [
    ...primary.value.filter((p) => !p.tab).map((p) => p.item),
    ...extra.value.flatMap((g) => g.items),
    ...(props.foot ?? []),
  ])
  const workspace = derived(() =>
    props.switcher?.workspaces.find((w) => w.id === props.switcher!.current),
  )
  const entries = derived(() => (props.account?.items ?? []).map((entry, n) => ({ entry, at: n })))
  const toggle = () => {
    if (wide.value) folded.value = !folded.value
    else navOpen.value = !navOpen.value
  }
  const closeNav = () => (navOpen.value = false)
  const toggleExpanded = derived(() => (wide.value ? !folded.value : navOpen.value))
  const toggleLabel = derived(() =>
    wide.value
      ? folded.value
        ? 'Expand sidebar'
        : 'Collapse sidebar'
      : navOpen.value
        ? 'Collapse navigation'
        : 'Expand navigation',
  )
  return {
    ...shellMenu(menuOpen, refs),
    props,
    get navLabel() {
      return props.navLabel === undefined ? 'Main' : props.navLabel
    },
    main,
    navId,
    menuId,
    sheetId,
    focus,
    folded,
    navOpen,
    wide,
    menuOpen,
    moreOpen,
    refs,
    groups,
    primary,
    extra,
    more,
    workspace,
    entries,
    toggle,
    closeNav,
    toggleExpanded,
    toggleLabel,
  }
}

function shellMenu(
  menuOpen: ReturnType<typeof state<boolean>>,
  refs: { from: HTMLElement | null; at: 'first' | 'last' },
) {
  const openMenu = (e: Event, where: 'first' | 'last' = 'first') => {
    refs.from = e.currentTarget as HTMLElement
    refs.at = where
    menuOpen.value = !menuOpen.value
  }
  const menuKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    if (!menuOpen.value) openMenu(e, e.key === 'ArrowUp' ? 'last' : 'first')
  }
  const shut = () => (menuOpen.value = false)
  return { openMenu, menuKey, shut }
}

type ShellData = ReturnType<typeof shellData>
function bindShell(props: ShellProps, d: ShellData) {
  use(
    shell,
    () => d.refs.root,
    () => ({
      navOpen: d.navOpen.value,
      current: props.current,
      onToggle: d.toggle,
      onCloseNav: d.closeNav,
      onWide: (w: boolean) => {
        d.wide.value = w
        if (w) d.navOpen.value = d.folded.value === 'hidden' && d.navOpen.value
      },
      onCommand: props.command?.onOpen,
    }),
  )
  use(
    menu,
    () => d.refs.menuEl,
    () => ({ open: d.menuOpen.value, trigger: () => d.refs.from, at: d.refs.at, onClose: d.shut }),
  )
  use(
    dialog,
    () => d.refs.sheetEl,
    () => ({ open: d.moreOpen.value, onClose: () => (d.moreOpen.value = false) }),
  )
}

export function shellState(props: ShellProps) {
  const d = shellData(props)
  bindShell(props, d)
  return d
}
export type ShellView = ReturnType<typeof shellState>
