import { Checkbox } from '../Choice'

export function EventCell({
  on,
  text,
  ch,
  onToggle,
}: {
  on: boolean
  text: string
  ch: string
  onToggle: (v: boolean) => unknown
}) {
  return (
    <Checkbox
      checked={on}
      tabindex="-1"
      onChange={(e: Event) => onToggle((e.target as HTMLInputElement).checked)}
    >
      <span data-part="sr-only">{text}</span>
      <span data-part="ch-name" aria-hidden="true">
        {ch}
      </span>
    </Checkbox>
  )
}
