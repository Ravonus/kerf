import { Markdown } from '@weft-js/warp'

export const MarkdownNewTab = () => (
  <Markdown
    linkTarget="_blank"
    source={
      'Read the [status page](https://example.com) ' +
      'before you deploy.'
    }
  />
)
