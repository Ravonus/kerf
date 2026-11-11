import { Markdown } from '@kerf-js/veneer'
import { NOTES } from './markdown-data'

export const MarkdownNotes = () => (
  <Markdown source={NOTES} />
)
