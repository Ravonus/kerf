import { RightIcon } from '@weft-js/warp-icons'
import type { SideNavProps } from '../SideNav'
import type { SideNavState } from './state'

type Props = Pick<SideNavState, 'id' | 'refs' | 'shown' | 'holds' | 'unfolded' | 'toggle'> & {
  props: SideNavProps
}
export function SideNavSections({ props, id, refs, shown, holds, unfolded, toggle }: Props) {
  return (
    <nav ref={(n) => (refs.list = n)} data-scope="navlist" data-bar="" aria-label={props.label}>
      <ul data-part="sections">
        {shown.value.map((x) => (
          <li key={x.section.title} data-current={holds(x.section) ? '' : undefined}>
            {x.section.pinned ? (
              <p data-part="group-label">{x.section.title}</p>
            ) : (
              <button
                type="button"
                data-part="item"
                data-fold=""
                aria-expanded={unfolded(x.section) ? 'true' : 'false'}
                aria-controls={`${id}-${x.n}`}
                onClick={() => toggle(x.section)}
              >
                <span data-part="fold-label">{x.section.title}</span>
                <span data-part="chevron" aria-hidden="true">
                  <RightIcon />
                </span>
              </button>
            )}
            <ul id={`${id}-${x.n}`} hidden={!unfolded(x.section)}>
              {x.items.map((i) => (
                <li key={i.href}>
                  <a
                    data-part="item"
                    href={i.href}
                    aria-current={i.href === props.current ? 'page' : undefined}
                  >
                    {i.label}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <span data-part="indicator" aria-hidden="true"></span>
    </nav>
  )
}

export function SideNavLead({ props }: { props: SideNavProps }) {
  return (
    <div data-part="lead" data-scope="navlist">
      <ul>
        {props.lead!.map((i) => (
          <li key={i.href}>
            <a
              data-part="item"
              href={i.href}
              aria-current={props.current?.startsWith(i.href) ? 'true' : undefined}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
