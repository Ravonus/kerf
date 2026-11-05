import { Question } from '@weft-js/warp'
import { GAP } from './shared'

export const QuestionClosed = () => (
  <Question
    question={{ ...GAP, closed: true }}
    quiet
  />
)
