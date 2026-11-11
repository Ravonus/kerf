import { state } from '@kerf-js/core'
import { Question } from '@kerf-js/veneer'
import { NOTIFY } from './shared'

export function QuestionManyAnswers() {
  const question = state<
    typeof NOTIFY & { answer?: string | string[] }
  >(NOTIFY)
  return (
    <Question
      question={question.value}
      quiet
      onAnswer={(answer) =>
        (question.value = { ...NOTIFY, answer })
      }
    />
  )
}
