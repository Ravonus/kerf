# SeededPlaceholder

Render deterministic, themeable SVG artwork for missing media.

```tsx
import { SeededPlaceholder } from '@kerf-js/veneer'

<SeededPlaceholder
  seed="ceramics"
  aspectRatio={16 / 9}
  accessibleLabel="Placeholder for the ceramics collection"
/>
```

Equal `seed` and `aspectRatio` values produce equal geometry on the server and client. `palette` accepts `background`, `foreground` and `accent` overrides. Colors use Veneer theme tokens by default. Supply `accessibleLabel` when the graphic conveys information on its own. Inside a named `ArtworkFrame`, leave the placeholder decorative.
