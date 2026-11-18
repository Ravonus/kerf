# ParticleField

Render an ambient, seeded particle background.

```tsx
import { ParticleField } from '@kerf-js/veneer'

<ParticleField
  seed="night-sky"
  density={36}
  velocity={{ x: 0.025, y: -0.1 }}
  style="height: 12rem"
/>
```

`density` sets the particle count up to 512. `velocity.x` and `velocity.y` are fractions of the canvas size per second. `palette` overrides the theme color. `paused`, `reducedMotion` and the system preference freeze the picture. Veneer suspends drawing outside the viewport and in hidden tabs. The canvas is decorative and lets pointer input through to the underlying interface.
