import { Button } from '@kerf/veneer'
import { state } from '@kerf/core'

type Row = { name: string; type: string; required: boolean; default?: string; doc: string }

/** Past this, a type folds behind a toggle. */
const LONG = 72

/** Words with `code` in them: the backticks become code, the rest stays text. */
const words = (text: string) =>
  text.split(/`([^`]+)`/).map((bit, i) => (i % 2 ? <code>{bit}</code> : bit))

/* @kerf visible */
/** One group of props. Long unions fold, and a required prop carries a dot. On a narrow column each prop stacks, and the
 * cells bring their own labels (data-label) since the header row is gone. */
export function PropsTable(props: { title: string; rows: Row[] }) {
  const open = state<string[]>([])
  const flip = (name: string) =>
    (open.value = open.value.includes(name)
      ? open.value.filter((n) => n !== name)
      : [...open.value, name])
  return (
    <div data-scope="props" tabindex="0" role="region" aria-label={props.title} data-site="props">
      <table>
        <thead>
          <tr>
            <th scope="col">{props.title === 'Props' ? 'Prop' : 'Event'}</th>
            <th scope="col">Type</th>
            <th scope="col">Default</th>
            <th scope="col">Description</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((p) => (
            <tr key={p.name}>
              <th scope="row">
                <code>{p.name}</code>
                {p.required && <span data-part="req" role="img" aria-label="required"></span>}
              </th>
              <td data-label="Type">
                <code>
                  {p.type.length > LONG && !open.value.includes(p.name)
                    ? `${p.type.slice(0, LONG)}…`
                    : p.type}
                </code>
                {p.type.length > LONG && (
                  <Button emphasis="link" tone="neutral" size="sm" onClick={() => flip(p.name)}>
                    {open.value.includes(p.name) ? 'Less' : 'More'}
                  </Button>
                )}
              </td>
              <td data-label="Default">{p.default ? <code>{p.default}</code> : '—'}</td>
              <td data-label="Description">{words(p.doc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
