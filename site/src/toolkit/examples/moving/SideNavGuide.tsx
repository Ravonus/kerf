import { state } from '@kerf-js/core'
import { SideNav } from '@kerf-js/veneer'
import { GUIDE, follow } from './shared'

export function SideNavGuide() {
  const at = state('#previews')
  // The edge bar folds it. Under 900px it opens over
  // the page, so no separate button is needed.
  return (
    <div onClick={follow(at)}>
      <SideNav
        label="Guide"
        sections={GUIDE}
        current={at.value}
        remember="toolkit:sidenav-guide"
      />
    </div>
  )
}
