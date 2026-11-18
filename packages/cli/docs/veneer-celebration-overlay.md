# CelebrationOverlay

Show a named celebration in a native modal with Escape, backdrop and close-button dismissal.

```tsx
import { state } from '@kerf-js/core'
import { Button, CelebrationOverlay } from '@kerf-js/veneer'

const open = state(false)

;<>
  <Button onClick={() => (open.value = true)}>Show result</Button>
  <CelebrationOverlay title="Complete" open={open}>
    Your export is ready.
  </CelebrationOverlay>
</>
```

`open` is a Kerf state box. Set it to false to close the dialog programmatically. `onDismiss` runs on each open-to-closed change, including a timeout. Focus returns to the opener after closing. Use `description` for a short accessible summary and `children` for content. Put decorative visuals in `media`.

Omit `duration` for persistent content. A positive finite `duration` is measured in milliseconds. Choose timed dismissal for a celebration whose important information remains available elsewhere. `reducedMotion` requests reduced motion for this overlay and its media. The modal also respects the system preference.
