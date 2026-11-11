import './styles'
import '@kerf-js/veneer-core/styles/layout/sidenav-title.css'

/** Props for SideNavTitle. */
export interface SideNavTitleProps {
  /** The open SideNav's title, shown while its panel is open on a phone. */
  title: unknown
  /** What the header shows the rest of the time, usually the brand. */
  children?: unknown
}

/**
 * The header's brand, swapped for a SideNav's title while its panel is open on a phone. Give the SideNav
 * `overlay="under"` so the panel opens below the header and leaves this in view.
 */
export function SideNavTitle(props: SideNavTitleProps) {
  return (
    <span data-scope="sidenav-title">
      <span data-part="home">{props.children}</span>
      <span data-part="title" aria-hidden="true">
        {props.title}
      </span>
    </span>
  )
}
