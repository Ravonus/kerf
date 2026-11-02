import { Link } from '@weft/start'
import { Nav } from '@weft/warp'
import { onMount } from 'weft'

export type NavGroup = { title: string; items: { href: string; label: string }[] }

/** The left rail, for docs and warp alike: every page's name, always showing. The current link is brought into view on arrival. */
export function SideNav(props: { label: string; groups: NavGroup[] }) {
  let box!: HTMLElement
  onMount(() => {
    const at = box.querySelector<HTMLElement>('a[aria-current]')
    if (at) box.scrollTop = at.offsetTop - box.clientHeight / 3
  })
  return (
    <aside data-site="doc-nav" data-vt="side" ref={box}>
      <Nav label={props.label} axis="y">
        {props.groups.map(g => (
          <div key={g.title} data-part="group">
            <h2>{g.title}</h2>
            {g.items.map(i => <Link key={i.href} href={i.href}>{i.label}</Link>)}
          </div>
        ))}
      </Nav>
    </aside>
  )
}
