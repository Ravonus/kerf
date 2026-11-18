# ProgressivePicture

Show a runtime image without changing the layout.

```tsx
import {
  ProgressivePicture,
  SeededPlaceholder,
} from '@kerf-js/veneer'

<ProgressivePicture
  src="/images/room.png"
  preview="/images/room-small.png"
  alt="A room with a tiled floor"
  ratio="4:3"
  transitionName="tiled-room"
  fallback={<SeededPlaceholder seed="room" />}
/>
```

Set `src` and `preview` to runtime image URLs. The preview remains visible while the main image loads and after a load failure. `fallback` supplies decorative content for absent or failed URLs. `alt` provides one accessible name across all three states.

The fixed `ratio` uses Frame's ratio names and defaults to square. `fit` selects cover or contain. `eager` gives the main image high fetch priority for a first-view image. Other images use native lazy loading. `transitionName` sets a stable `data-kerf-shared` key for matching instances across Start routes. Forward runtime descriptors from the caller. For build-known artwork, use Kerf's media pipeline.
