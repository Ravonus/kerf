import type { State } from '@kerf/core'
import type { MentionItem } from '@kerf/veneer-core'
import type { bindable } from '../bind'
import type { MentionRefs } from './actions'

const initials = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)

type Props = {
  refs: MentionRefs
  hits: State<MentionItem[]>
  active: State<number>
  empty: State<string>
  person: { readonly value: boolean }
  said: State<string>
  held: ReturnType<typeof bindable<string>>
  name: string | undefined
  id: string
  pick: (n: number, reason: 'keyboard' | 'pointer') => void
}
export function MentionsEnd({
  refs,
  hits,
  active,
  empty,
  person,
  said,
  held,
  name,
  id,
  pick,
}: Props) {
  return (
    <>
      <span ref={(n) => (refs.mark = n)} data-part="caret-anchor" aria-hidden="true"></span>
      <div
        ref={(n) => (refs.pop = n)}
        data-scope="popover"
        data-kind="combo"
        data-sweep=""
        popover="manual"
        role="presentation"
        onPointerDown={(e) => e.preventDefault()}
      >
        <span data-part="sweep" aria-hidden="true"></span>
        <ul data-part="listbox" role="listbox" id={id} aria-label="Suggestions">
          {hits.value.map((it, n) => (
            <li
              key={it.id}
              role="option"
              id={`${id}-${n}`}
              aria-selected={n === active.value ? 'true' : 'false'}
              data-active={n === active.value ? '' : undefined}
              onClick={() => pick(n, 'pointer')}
            >
              {person.value && (
                <span class="av" aria-hidden="true">
                  {initials(it.label)}
                </span>
              )}
              <span>{it.label}</span>
              {it.meta && <span data-part="opt-meta">{it.meta}</span>}
            </li>
          ))}
          {!hits.value.length && (
            <li role="option" aria-disabled="true" aria-selected="false">
              {empty.value}
            </li>
          )}
        </ul>
      </div>
      <span data-part="sr-only" role="status">
        {said.value}
      </span>
      {name && <input type="hidden" name={name} value={held.value} />}
    </>
  )
}
