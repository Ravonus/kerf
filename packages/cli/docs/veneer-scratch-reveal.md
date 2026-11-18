# ScratchReveal

Cover content with a scratchable layer and a native reveal button.

```tsx
import { ScratchReveal } from '@kerf-js/veneer'

<ScratchReveal label="Reveal the result" threshold={0.22}>
  <p>Your result is ready.</p>
</ScratchReveal>
```

Drag to uncover the given fraction of distinct cover area. Tap, Enter and Space reveal immediately. `label` is both the visible prompt and accessible name. Set `cover` to a CSS color with adequate text contrast. `threshold` defaults to 0.25. Use CSS to size the cover through its wrapper or the content.

`onReveal` fires once per reveal. Set `revealed` and update it in `onReveal` for controlled behavior. Moving it from true to false resets the mask. The `children` become keyboard-accessible after reveal, and focus advances to the result when the opener held focus. `reducedMotion` suppresses the fade. Treat the cover as visual presentation because the content may already be in the server HTML.
