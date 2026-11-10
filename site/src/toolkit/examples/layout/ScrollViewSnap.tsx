import { ScrollView } from '@weft-js/warp'

const slides = ['One', 'Two', 'Three', 'Four', 'Five']
const slide =
  'flex:0 0 240px;height:140px;display:grid;' +
  'place-items:center;border-radius:12px;' +
  'background:var(--warp-color-surface-sunken)'

export const ScrollViewSnap = () => (
  <ScrollView
    label="Slides"
    axes="x"
    snap={{
      selector: '[data-slide]',
      type: 'mandatory',
      axis: 'x',
    }}
    style="height:170px;max-width:520px"
  >
    <div style="display:flex;gap:12px;width:max-content">
      {slides.map((s) => (
        <div
          data-slide=""
          style={slide}
        >
          {s}
        </div>
      ))}
    </div>
  </ScrollView>
)
