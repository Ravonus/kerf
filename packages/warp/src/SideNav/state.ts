import {
  navIndicator,
  readCollapsed,
  readFolds,
  sideNav,
  uid,
  writeCollapsed,
  writeFolds,
  type Folds,
} from '@weft-js/warp-core'
import { derived, onMount, state, untrack, watch } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import type { SideNavProps, SideNavSection } from '../SideNav'

export function sideNavState(props: SideNavProps) {
  const id = untrack(() => props.id) ?? uid('sidenav')
  const chosen = state<Folds>({})
  const query = state('')
  const open = state(false)
  const collapsible = untrack(() => props.collapsible) !== false
  const collapsed = state(false)
  const refs: { root?: HTMLElement | undefined; list?: HTMLElement | undefined } = {}

  const key = () =>
    props.remember === false ? undefined : (props.remember ?? `warp:sidenav:${props.label}`)
  const holds = (s: SideNavSection) => s.items.some((i) => i.href === props.current)
  const words = derived(() => query.value.trim().toLowerCase())
  const shown = derived(() =>
    props.sections
      .map((section, n) => ({
        section,
        n,
        items: words.value
          ? section.items.filter((i) => i.label.toLowerCase().includes(words.value))
          : section.items,
      }))
      .filter((x) => x.items.length > 0),
  )
  const unfolded = (s: SideNavSection) =>
    words.value !== '' || !!s.pinned || (chosen.value[s.title] ?? holds(s))
  const toggle = (s: SideNavSection) => {
    chosen.value = { ...chosen.value, [s.title]: !unfolded(s) }
    const k = key()
    if (k) writeFolds(k, chosen.value)
  }
  bindSideNav(props, { key, holds, chosen, collapsible, collapsed, open, refs })

  const filterText = () =>
    typeof props.filter === 'string' ? props.filter : `Filter ${props.label.toLowerCase()}`
  return {
    id,
    query,
    open,
    collapsible,
    collapsed,
    refs,
    words,
    shown,
    holds,
    unfolded,
    toggle,
    filterText,
  }
}
export type SideNavState = ReturnType<typeof sideNavState>

function bindSideNav(
  props: SideNavProps,
  d: {
    key: () => string | undefined
    holds: (s: SideNavSection) => boolean
    chosen: ReturnType<typeof state<Folds>>
    collapsible: boolean
    collapsed: ReturnType<typeof state<boolean>>
    open: ReturnType<typeof state<boolean>>
    refs: { root?: HTMLElement | undefined; list?: HTMLElement | undefined }
  },
) {
  const { key, holds, chosen, collapsible, collapsed, open, refs } = d
  // Arriving on a page opens its section, whatever was remembered, so the current link is never folded away.
  const reveal = () => {
    const s = props.sections.find(holds)
    if (s && chosen.value[s.title] === false) chosen.value = { ...chosen.value, [s.title]: true }
  }
  const fold = (v: boolean) => {
    collapsed.value = v
    const k = key()
    if (k) writeCollapsed(`${k}:collapsed`, v)
  }
  onMount(() => {
    const k = key()
    if (k) chosen.value = readFolds(k)
    if (k && collapsible) collapsed.value = readCollapsed(`${k}:collapsed`)
    reveal()
  })
  watch(
    () => props.current,
    () => {
      reveal()
      open.value = false
    },
  )
  use(
    sideNav,
    () => refs.root,
    () => ({
      current: props.current,
      open: open.value,
      onOpenChange: (v: boolean) => (open.value = v),
      collapsed: collapsed.value,
      onCollapsedChange: fold,
    }),
  )
  // warp's sliding bar, as Nav and the on-page rail have it: it follows the pointer and keyboard, and slides to a new page.
  use(
    navIndicator,
    () => refs.list,
    () => ({ axis: 'y' as const }),
  )
}
