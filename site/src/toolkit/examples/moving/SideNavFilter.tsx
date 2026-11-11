import { state } from '@kerf/core'
import { SideNav } from '@kerf/veneer'
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
