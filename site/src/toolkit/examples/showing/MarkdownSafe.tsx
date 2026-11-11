import { Markdown } from '@kerf/veneer'

export const MarkdownSafe = () => (
  <Markdown
    source={
      'Raw HTML shows as text: ' +
      '<script>alert("no")</script>'
    }
  />
)
