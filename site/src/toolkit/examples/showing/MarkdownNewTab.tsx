import { Markdown } from '@kerf/veneer'

export const MarkdownNewTab = () => (
  <Markdown
    linkTarget="_blank"
    source={
      'Read the [status page](https://example.com) ' +
      'before you deploy.'
    }
  />
)
