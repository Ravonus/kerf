import { state } from '@kerf-js/core'
import { Question } from '@kerf-js/veneer'
import { GAP } from './shared'

export function QuestionPickScope() {
  const question = state<
    typeof GAP & { answer?: string | string[] }
  >(GAP)
  return (
    <Question
      question={question.value}
      quiet
      onAnswer={(answer) =>
        (question.value = { ...GAP, answer })
      }
    />
  )
}
