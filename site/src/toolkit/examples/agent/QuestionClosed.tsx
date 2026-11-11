import { Question } from '@kerf/veneer'
import { GAP } from './shared'

export const QuestionClosed = () => (
  <Question
    question={{ ...GAP, closed: true }}
    quiet
  />
)
