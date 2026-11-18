# ArtworkFrame

Display an image with an optional decorative fallback and pixel-based corner treatment.

```tsx
import { ArtworkFrame, SeededPlaceholder } from '@kerf-js/veneer'

<ArtworkFrame
  src="/images/ceramics.png"
  alt="Three ceramic bowls"
  aspectRatio={1}
  fallback={<SeededPlaceholder seed="ceramics" />}
  allowAnalysis
/>
```

`src` may be absent. A failed or absent image shows `fallback`. `alt` names the image or fallback and can be empty for decorative use. `loading` sets the native loading behavior. `imageClass` goes on the image. Other attributes go on the frame.

`allowAnalysis` opts into a bounded scan of the displayed image. Same-origin, data and blob images can be read. A remote image requires `crossorigin="anonymous"` and a CORS grant. The component reuses the displayed image and leaves an unreadable image visible. `onAnalysis` receives a `CornerAnalysis` or `null`. The result includes `reason`, `shouldClip`, `scale`, `repairColor`, `repairInsetRatio` and `confidence`.

`repair="auto"` fills transparent corners when a stable color is available and otherwise crops on `fit="cover"`. `repair="crop"` chooses scaling for cover images. `repair="none"` reports the scan and leaves display geometry alone. Set `fit="contain"` to preserve the full image. Give the frame an `aspectRatio` or a CSS size for stable layout.
