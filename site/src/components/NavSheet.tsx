import { Button } from '@weft-js/warp'
import { state } from '@weft-js/core'
import { render } from '@weft-js/core/dom'

const fetchSheet = () => import('./NavDrawer')

/** The menu button, hidden from 720px where the links sit in the bar. The sheet comes on the way to a press. */
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
