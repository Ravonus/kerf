# ResultsToolbar

Show a result count and the actions for the list in a wrapping row.

```tsx
import { Button, ResultsToolbar } from '@kerf-js/veneer'

<ResultsToolbar
  count={128}
  noun="records"
  announce
  actions={<Button emphasis="outline">Sort</Button>}
/>
```

The caller supplies a localized `noun` in the required singular or plural form. `locale` formats the number consistently across the server and browser and defaults to `en-US`. `leading` follows the count. `actions` holds the buttons, switches or fields for the same list. `announce` makes count changes a polite status update. Each control retains its own keyboard behavior and tab order.
