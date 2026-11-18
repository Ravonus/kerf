# StreakIndicator

Show a labeled count with visual intensity tied to thresholds.

```tsx
import { StreakIndicator } from '@kerf-js/veneer'

<StreakIndicator
  label="Consecutive days"
  value={12}
  thresholds={[3, 7, 14]}
  detail="Personal best: 18"
/>
```

Each reached threshold increases the glow. `palette` can override its colors, starting at index 0 for the baseline. `detail` places optional copy below the value. The count and label stay visible under reduced motion. Set `reducedMotion` to stop the pulse locally.
