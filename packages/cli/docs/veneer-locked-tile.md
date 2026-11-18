# LockedTile

Explain a restriction and expose the content when it becomes available.

```tsx
import { state } from '@kerf-js/core'
import { LockedTile, Link } from '@kerf-js/veneer'

const ready = state(false)

<LockedTile
  label="Archive"
  locked={!ready.value}
  reason="Available when the export is complete."
  progress={65}
  progressLabel="Export progress"
>
  <Link href="/archive">View archive</Link>
</LockedTile>
```

`locked` defaults to true. In that state, the tile shows `reason`, `fallback`, and an optional `progress` value from 0 to 100. The unlocked state renders `children`. `label` names the tile. Set `status` to localize its visible state badge, and use `icon` for a decorative glyph. Additional attributes go on the tile.
