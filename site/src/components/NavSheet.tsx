import { Button } from '@weft-js/warp'
import { state } from '@weft-js/core'
import { render } from '@weft-js/core/dom'

const fetchSheet = () => import('./NavDrawer')

/**
 * The menu button, hidden from 900px where the links sit in the bar. It opens a small sheet of the top links, which
 * comes on the way to a press. A page with a section (Learn, Reference, the toolkit) hides it: that section's SideNav
 * has its own bar down the left edge, and its panel leads with the same top links.
 */
export function NavSheet() {
  const open = state(false)
  let box: HTMLElement | undefined
  let made = false
  const show = async () => {
    if (!made) {
      made = true
      const { NavDrawer } = await fetchSheet()
      render(() => <NavDrawer open={open} />, box!)
    }
    open.value = true
  }
  return (
    <>
      <Button data-site="menu" emphasis="ghost" tone="neutral" size="sm" icon="menu" label="Menu" onClick={show} onPointerDown={fetchSheet} />
      <span ref={el => (box = el)}></span>
    </>
  )
}
