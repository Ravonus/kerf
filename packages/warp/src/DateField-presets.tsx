// The preset rail in the range picker.
import type { RangeDateModel } from './DateField-range'

export function RangeDatePresets({ field }: { field: RangeDateModel }) {
  const { narrow, list, onRail, chosen, applyPreset } = field
  return (
    <ul
      role="listbox"
      aria-label="Presets"
      aria-orientation={narrow.value ? 'horizontal' : 'vertical'}
      onKeyDown={onRail}
    >
      {list.value.map((p) => (
        <li
          key={p.id}
          role="option"
          data-id={p.id}
          tabindex={p.id === (chosen.value ?? list.value[0]!.id) ? '0' : '-1'}
          aria-selected={p.id === chosen.value ? 'true' : 'false'}
          onClick={() => applyPreset(p)}
        >
          {p.label}
        </li>
      ))}
    </ul>
  )
}
