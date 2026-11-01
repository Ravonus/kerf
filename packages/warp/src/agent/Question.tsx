import { CheckIcon } from '@weft/icons'
import { announce, uid, type AgentQuestion } from '@weft/ui-core'
import { derived, onMount, state, untrack } from 'weft'
import { Button } from '../Button'
import { Input } from '../Field'
import '../styles'
import '@weft/ui-core/styles/app/question.css'

/**
 * Question (07 §1.3): the run pauses and asks. A fieldset with the question as legend, radios or checkboxes, optional
 * free text; Continue is the solid. Once answered it reads back the choice.
 */
export function Question({ question, onAnswer, quiet }: { question: AgentQuestion; onAnswer?: (answer: string | string[]) => void; quiet?: boolean }) {
  const name = uid('q')
  const type = derived(() => (question.multiple ? 'checkbox' : 'radio'))
  const picks = state<string[]>(untrack(() => (question.multiple ? [] : question.options.slice(0, 1))))
  const free = state('')
  const other = '__other'
  const options = derived(() => [...question.options.map(o => ({ value: o, label: o })), ...(question.free ? [{ value: other, label: 'Something else…' }] : [])])
  const answered = derived(() => question.answer)
  const said = derived(() => { const a = answered.value; return Array.isArray(a) ? a.join(', ') : a })
  let form: HTMLFormElement | undefined
  onMount(() => { if (!untrack(() => quiet) && form) announce(form.ownerDocument, 'The assistant has a question.', true) })
  const toggle = (v: string, on: boolean) => (picks.value = question.multiple ? (on ? [...picks.value, v] : picks.value.filter(x => x !== v)) : [v])
  const submit = (e: Event) => {
    e.preventDefault()
    const chosen = picks.value.map(p => (p === other ? free.value.trim() : p)).filter(Boolean)
    if (chosen.length) onAnswer?.(question.multiple ? chosen : chosen[0])
  }
  // one build per phase: a list around this reads its nodes again as siblings arrive, and picks must survive that
  const done = derived(() => answered.value !== undefined)
  const view = derived(() => (done.value ? (
    <p><CheckIcon /> You chose: {said.value}</p>
  ) : untrack(() => (
        <form ref={(n: any) => (form = n)} data-scope="question" onSubmit={submit}>
          <fieldset disabled={question.closed}>
            <legend>{question.prompt}</legend>
            {options.value.map(o => (
              <label key={o.value}>
                <input type={type.value} name={name} checked={picks.value.includes(o.value)} onChange={e => toggle(o.value, (e.currentTarget as HTMLInputElement).checked)} /> {o.label}
              </label>
            ))}
            {picks.value.includes(other) && <Input label="Your answer" value={free.value} onInput={e => (free.value = e.currentTarget.value)} />}
          </fieldset>
          <div>
            <Button size="sm" type="submit" disabled={question.closed}>Continue</Button> <small>{question.closed ? 'The run stopped before this was answered.' : 'Waiting for you'}</small>
          </div>
        </form>
  ))))
  return <>{view.value}</>
}
