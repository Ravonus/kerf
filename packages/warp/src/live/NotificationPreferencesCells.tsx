import { triState, type PrefEvent, type PrefRules, type PrefValues } from '@weft-js/warp-core'
import { derived, type State } from '@weft-js/core'
import { Checkbox } from '../Choice'
import type { preferencesSave } from './NotificationPreferencesSave'

export function preferencesCells(
  model: State<PrefValues>,
  fixed: PrefRules,
  parent: ReturnType<typeof preferencesSave>['parent'],
  onNa: (e: KeyboardEvent) => void,
) {
  const parentBox = (
    evs: PrefEvent[],
    c: string,
    nameText: string,
    visible: string,
    where: string | undefined,
    first: boolean,
  ) => {
    const tri = derived(() => triState(model.value, evs, fixed, c))
    return (
      <Checkbox
        checked={tri.value === 'on'}
        indeterminate={tri.value === 'mixed'}
        tabindex={first ? '0' : '-1'}
        onChange={() => parent(evs, c, where)}
      >
        <span data-part="sr-only">{nameText}</span>
        <span data-part="ch-name" aria-hidden="true">
          {visible}
        </span>
      </Checkbox>
    )
  }
  const na = (text: string, chName?: string) => (
    <span data-part="na" tabindex="-1" onKeyDown={onNa}>
      <span aria-hidden="true">—</span>
      <span data-part="sr-only">{text}</span>
      {chName && (
        <span data-part="ch-name" aria-hidden="true">
          {chName}
        </span>
      )}
    </span>
  )
  return { parentBox, na }
}
