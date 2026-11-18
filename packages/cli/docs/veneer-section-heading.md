# SectionHeading

Add context and actions to a heading that follows the document outline.

```tsx
import { Button, SectionHeading } from '@kerf-js/veneer'

<SectionHeading
  level={2}
  eyebrow="Library"
  title="Recent exports"
  description="Files prepared this week."
  actions={<Button emphasis="outline">New export</Button>}
/>
```

`title` supplies the heading and `level` selects its HTML heading level, defaulting to 2. Set `role` to one of the Heading roles to change its type treatment. `eyebrow` and `description` are optional supporting copy. `actions` wraps below the copy in narrow containers. Extra attributes go on the wrapper.
