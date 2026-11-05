import { Markdown } from '@weft-js/warp'

export const MarkdownSafe = () => (
  <Markdown
    source={
      'Raw HTML shows as text: ' +
      '<script>alert("no")</script>'
    }
  />
)
