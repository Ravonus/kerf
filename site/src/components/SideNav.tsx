import { Link } from '@weft-js/start'
import { Nav } from '@weft-js/warp'
import { onMount, state, watch } from '@weft-js/core'

/** `pinned` keeps a group open and unfoldable in a rail that folds, such as Learn's overview link. */
export type NavGroup = { title: string; items: { href: string; label: string }[]; pinned?: boolean }

/** One localStorage entry for every rail that folds, by the rail's label: which groups this viewer opened or closed. */
const KEY = 'weft:site:nav-open'
type Chosen = Record<string, boolean>

function remembered(rail: string): Chosen {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Chosen | undefined>)[rail] ?? {}
  } catch {
    return {} // storage blocked, or a value this code didn't write: start from the defaults
  }
}

function remember(rail: string, chosen: Chosen) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Chosen>
    localStorage.setItem(KEY, JSON.stringify({ ...all, [rail]: chosen }))
  } catch {
    // Storage is blocked or full: the rail still folds for this visit, it just won't remember.
  }
}

/**
 * A rail's groups. With `fold`, each group's heading is a button that opens and closes it: the group holding `current`
 * starts open and the rest closed, and a viewer's own choices are kept in localStorage. Arriving on a page always opens
 * its group, whatever was remembered, so the current link is never hidden.
 */
export function NavGroups(props: { label: string; groups: NavGroup[]; current?: string | undefined; fold?: boolean | undefined }) {
  const chosen = state<Chosen>({})
  const holds = (g: NavGroup) => g.items.some(i => i.href === props.current)
  const open = (g: NavGroup) => !props.fold || !!g.pinned || (chosen.value[g.title] ?? holds(g))
  const toggle = (g: NavGroup) => {
    chosen.value = { ...chosen.value, [g.title]: !open(g) }
    remember(props.label, chosen.value)
  }
  const reveal = () => {
    const g = props.groups.find(holds)
    if (g && chosen.value[g.title] === false) chosen.value = { ...chosen.value, [g.title]: true }
  }
  onMount(() => {
    if (!props.fold) return
    chosen.value = remembered(props.label)
    reveal()
  })
  watch(() => props.current, reveal)
  const id = (n: number) => `${props.label.toLowerCase().replace(/\W+/g, '-')}-group-${n}`
  return (
    <>
      {props.groups.map((g, n) => (
        <div key={g.title} data-part="group" data-open={open(g) ? '' : undefined} data-current={holds(g) ? '' : undefined}>
          {props.fold && !g.pinned
            ? (
              <h2>
                <button type="button" data-part="fold" aria-expanded={open(g) ? 'true' : 'false'} aria-controls={id(n)} onClick={() => toggle(g)}>
                  <span>{g.title}</span>
                </button>
              </h2>
            )
            : <h2>{g.title}</h2>}
          <div id={id(n)} data-part="links" hidden={!open(g)}>
            {g.items.map(i => <Link key={i.href} href={i.href}>{i.label}</Link>)}
          </div>
        </div>
      ))}
    </>
  )
}

/**
 * The left rail, for docs and warp alike: every page's name. The current link is brought into view on arrival. With
 * `fold` (Learn), each group folds under its heading, and only the current page's group starts open.
 */
export function SideNav(props: { label: string; groups: NavGroup[]; current?: string | undefined; fold?: boolean | undefined }) {
  // oxlint-disable-next-line no-unassigned-vars -- the compiler assigns it through ref
  let box!: HTMLElement
  onMount(() => {
    const at = box.querySelector<HTMLElement>('a[aria-current]')
    if (at) box.scrollTop = at.offsetTop - box.clientHeight / 3
  })
  return (
    <aside data-site="doc-nav" data-vt="side" data-fold={props.fold ? '' : undefined} ref={box}>
      <Nav label={props.label} axis="y">
        <NavGroups label={props.label} groups={props.groups} current={props.current} fold={props.fold} />
      </Nav>
    </aside>
  )
}
