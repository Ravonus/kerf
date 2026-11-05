import { CheckIcon } from '@weft-js/warp-icons'
import { announce, uid, type AgentQuestion } from '@weft-js/warp-core'
import { derived, onMount, state, untrack, type State } from '@weft-js/core'
import { Button } from '../Button'
import { Checkbox, Radio } from '../Choice'
import { Input } from '../Field'
import '../styles'
import '@weft-js/warp-core/styles/app/question.css'

type QuestionProps = {
  question: AgentQuestion
  onAnswer?: (answer: string | string[]) => void
  quiet?: boolean | undefined
}

/**
 * Question (07 §1.3): the run pauses and asks. A fieldset with the question as legend, radios or checkboxes, optional
 * free text; Continue is the solid. Once answered it reads back the choice.
 */
export function Question({ question, onAnswer, quiet }: QuestionProps) {
  const name = uid('q')
  const type = derived(() => (question.multiple ? 'checkbox' : 'radio'))
  const picks = questionPicks(() => question)
  const free = state('')
  const other = '__other'
  const options = questionOptions(() => question, other)
  const answered = derived(() => question.answer)
  const said = questionSaid(answered)
  let form: HTMLFormElement | undefined
  onMount(() => {
    if (!untrack(() => quiet) && form)
      announce(form.ownerDocument, 'The assistant has a question.', true)
  })
  const toggle = questionToggle(picks, () => question)
  const submit = questionSubmit(
    { picks, free, other },
    () => question,
    (answer) => onAnswer?.(answer),
  )
  // one build per phase: a list around this reads its nodes again as siblings arrive, and picks must survive that
  const done = derived(() => answered.value !== undefined)
  const view = derived(() =>
    done.value ? (
      <p>
        <CheckIcon /> You chose: {said.value}
      </p>
    ) : (
      untrack(() => (
        <form ref={(n) => (form = n)} data-scope="question" onSubmit={submit}>
          <fieldset disabled={question.closed}>
            <legend>{question.prompt}</legend>
            {options.value.map((o) =>
              type.value === 'radio' ? (
                <Radio
                  key={o.value}
                  name={name}
                  checked={picks.value.includes(o.value)}
                  onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
                    toggle(o.value, e.currentTarget.checked)
                  }
                >
                  {o.label}
                </Radio>
              ) : (
                <Checkbox
                  key={o.value}
                  name={name}
                  checked={picks.value.includes(o.value)}
                  onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
                    toggle(o.value, e.currentTarget.checked)
                  }
                >
                  {o.label}
                </Checkbox>
              ),
            )}
            {picks.value.includes(other) && (
              <Input
                label="Your answer"
                value={free.value}
                onInput={(e) => (free.value = e.currentTarget.value)}
              />
            )}
          </fieldset>
          <div>
            <Button size="sm" type="submit" disabled={question.closed}>
              Continue
            </Button>{' '}
            <small>
              {question.closed ? 'The run stopped before this was answered.' : 'Waiting for you'}
            </small>
          </div>
        </form>
      ))
    ),
  )
  return <>{view.value}</>
}

function questionOptions(question: () => AgentQuestion, other: string) {
  return derived(() => [
    ...question().options.map((o) => ({ value: o, label: o })),
    ...(question().free ? [{ value: other, label: 'Something else…' }] : []),
  ])
}

function questionToggle(picks: State<string[]>, question: () => AgentQuestion) {
  return (v: string, on: boolean) =>
    (picks.value = question().multiple
      ? on
        ? [...picks.value, v]
        : picks.value.filter((x) => x !== v)
      : [v])
}

function questionSubmit(
  { picks, free, other }: { picks: State<string[]>; free: State<string>; other: string },
  question: () => AgentQuestion,
  onAnswer: NonNullable<QuestionProps['onAnswer']>,
) {
  return (e: Event) => {
    e.preventDefault()
    const chosen = picks.value.map((p) => (p === other ? free.value.trim() : p)).filter(Boolean)
    if (chosen.length) onAnswer(question().multiple ? chosen : chosen[0]!)
  }
}

function questionSaid(answered: { readonly value: AgentQuestion['answer'] }) {
  return derived(() => {
    const a = answered.value
    return Array.isArray(a) ? a.join(', ') : a
  })
}

function questionPicks(question: () => AgentQuestion) {
  return state<string[]>(untrack(() => (question().multiple ? [] : question().options.slice(0, 1))))
}
