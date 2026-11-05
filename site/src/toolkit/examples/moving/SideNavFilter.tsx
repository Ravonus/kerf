import { state } from '@weft-js/core'
import { SideNav } from '@weft-js/warp'
import { GUIDE, follow } from './shared'

export function SideNavFilter() {
  const at = state('#invoices')
  return (
    <div onClick={follow(at)}>
      <SideNav
        label="Guide"
        sections={GUIDE}
        current={at.value}
        filter="Filter pages"
        remember={false}
      />
    </div>
  )
}
