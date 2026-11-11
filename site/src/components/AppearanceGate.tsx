import { Button } from '@kerf-js/veneer'
import { render } from '@kerf-js/core/dom'

const fetchMenu = () => import('./Appearance')

/** The Appearance button. The menu behind it is fetched on the way to a press, and takes the button's place already open. */
export function AppearanceGate() {
  let box: HTMLElement | undefined
  const open = async () => {
    const { Appearance } = await fetchMenu()
    box!.textContent = ''
    render(() => <Appearance />, box!)
    box!.querySelector('button')!.click()
  }
  return (
    <span data-site="gate" ref={(n) => (box = n)}>
      <Button
        emphasis="ghost"
        tone="neutral"
        size="sm"
        icon="palette"
        label="Appearance"
        onClick={open}
        onPointerEnter={fetchMenu}
        onFocus={fetchMenu}
      />
    </span>
  )
}
