import { Button } from '@weft/warp'
import { state } from 'weft'
import { render } from 'weft/dom'

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
      <span ref={(n: any) => (box = n)}></span>
    </>
  )
}
