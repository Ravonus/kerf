import { state } from '@weft-js/core'
import { SideNav } from '@weft-js/warp'
import { GUIDE, follow } from './shared'

export function SideNavGuide() {
  const at = state('#previews')
  // The bar at the panel's edge folds it, and under 900px opens it over the page: no button of its own needed.
  return (
    <div onClick={follow(at)}>
      <SideNav label="Guide" sections={GUIDE} current={at.value} remember="toolkit:sidenav-guide" />
    </div>
  )
}
