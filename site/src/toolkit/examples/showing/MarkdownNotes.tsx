import { Markdown } from '@kerf/veneer'
import { NOTES } from './markdown-data'

export const MarkdownNotes = () => (
  <Markdown source={NOTES} />
)
