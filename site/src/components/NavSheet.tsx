import { Button } from '@weft-js/warp'
import { state } from '@weft-js/core'
import { render } from '@weft-js/core/dom'

const fetchSheet = () => import('./NavDrawer')
/** Kept here, not imported from lib/sections, so the header's island doesn't carry every section's page list. */
const SITE_NAV_ID = 'site-nav'

/**
 * The menu button, hidden from 900px where the links sit in the bar. On a page with a section (Learn, Reference, the
 * toolkit) it controls that section's SideNav, which opens itself from the left; elsewhere it opens a small sheet of the
 * top links, which comes on the way to a press.
 */
export function NavSheet() {
  const open = state(false)
  let box: HTMLElement | undefined
  let made = false
  const show = async () => {
    if (document.getElementById(SITE_NAV_ID)) return // the SideNav's own behaviour opens it
    if (!made) {
      made = true
      const { NavDrawer } = await fetchSheet()
      render(() => <NavDrawer open={open} />, box!)
    }
    open.value = true
  }
  return (
    <>
      <Button data-site="menu" emphasis="ghost" tone="neutral" size="sm" icon="menu" label="Menu" aria-controls={SITE_NAV_ID} onClick={show} onPointerDown={fetchSheet} />
      <span ref={el => (box = el)}></span>
    </>
  )
}
