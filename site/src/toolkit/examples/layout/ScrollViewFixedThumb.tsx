import { ScrollView } from '@weft-js/warp'

const rows = Array.from({ length: 400 }, (_, i) => i)

export const ScrollViewFixedThumb = () => (
  <ScrollView
    label="Events"
    axes="y"
    thumb={{ size: 28 }}
    bar={{
      show: 'always',
      layout: 'gutter',
      width: 8,
      hoverWidth: 8,
      radius: 2,
    }}
    style="height:220px"
  >
    {rows.map((n) => (
      <p style="margin:0;padding:6px 12px">Event {n}</p>
    ))}
  </ScrollView>
)
