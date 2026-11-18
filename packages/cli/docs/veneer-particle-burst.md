# ParticleBurst

Play a finite, seeded burst of confetti, disks or caller-supplied sprites.

```tsx
import { ParticleBurst } from '@kerf-js/veneer'

<ParticleBurst
  seed="export-complete"
  count={60}
  volleys={3}
  volleyGap={300}
  duration={1400}
  origin={{ x: 0.5, y: 0.9 }}
/>
```

Change `replayKey` or toggle `active` off and back on to replay. `count` is the total across all `volleys`. `duration` is the lifetime of each volley and `volleyGap` is the delay between volleys, both in milliseconds. `origin` uses unit coordinates from the top left. `speed` is in CSS pixels per second, `gravity` in CSS pixels per second squared, and `spread` in radians around `direction`, which points upward by default.

Supply `palette` as CSS color strings or use the theme color. The default `particle` is confetti. Choose `disk`, `dot`, or pass `sprites` as an array of `{ src }` objects for an image burst. `reducedMotion` or the system preference presents a still composition. The canvas is decorative, and its clock pauses offscreen. Use wrapper CSS to size or position it.
