import { Card, Markdown } from '@kerf/veneer'
import { COMMENT } from './markdown-data'

export const MarkdownComment = () => (
  <Card eyebrow="Priya Raman, on d-4821">
    <Markdown source={COMMENT} />
  </Card>
)
