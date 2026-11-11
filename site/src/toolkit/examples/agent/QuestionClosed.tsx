import { Question } from '@kerf-js/veneer'
import { GAP } from './shared'

export const QuestionClosed = () => (
  <Question
    question={{ ...GAP, closed: true }}
    quiet
  />
)
