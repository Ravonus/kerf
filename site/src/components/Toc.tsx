import { Nav } from '@weft-js/warp'

/* @weft visible */
/** On this page: warp's Nav follows the heading in view. */
export function Toc(props: { items: { id: string; text: string; depth?: number }[] }) {
  return (
    <aside data-site="toc">
      {props.items.length > 0 && <p data-part="label">On this page</p>}
      <Nav label="On this page" axis="y" spy>
        {props.items.map(t => <a key={t.id} href={`#${t.id}`} data-depth={t.depth}>{t.text}</a>)}
      </Nav>
    </aside>
  )
}
