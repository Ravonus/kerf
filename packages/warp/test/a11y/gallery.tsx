// Every warp component on one page for the a11y suite (scripts/a11y.mjs): fixtures/Variants.tsx's branches, plus the
// three components it doesn't render. `?part=` picks what is mounted, since an open modal makes the rest inert:
// static (everything in flow), overlays (Variants' open Modal and Drawer, a closed Popover), toasts.
import { render } from 'weft/dom'
import { Button } from '../../src/Button'
import { Kbd } from '../../src/Kbd'
import { Spinner } from '../../src/Spinner'
import { Tooltip } from '../../src/Tooltip'
import { Alerts, Buttons, Choices, Fields, Icons, Overlays, Surfaces, Tabbed, Toasts, Toggles, seedToasts } from '../fixtures/Variants'

function Static() {
  return (
    <>
      <h1>warp gallery</h1>
      <Buttons />
      {/* Buttons' submit passes aria-controls="x" through: give it its target */}
      <p id="x">Submit controls this.</p>
      <Icons />
      <Toggles />
      <Fields />
      <Choices />
      <Surfaces />
      <Alerts />
      <Tabbed />
      <p>Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> to search.</p>
      <Spinner label="Loading" />
      <Spinner />
      <Tooltip content="Copy the link" kbd="C"><Button emphasis="outline">Copy</Button></Tooltip>
    </>
  )
}

const part = new URLSearchParams(location.search).get('part') ?? 'static'
if (part === 'toasts') seedToasts()
const View = part === 'overlays' ? () => <><h1>warp overlays</h1><Overlays /></> : part === 'toasts' ? () => <><h1>warp toasts</h1><Toasts /></> : Static
render(() => <View />, document.getElementById('root')!)
