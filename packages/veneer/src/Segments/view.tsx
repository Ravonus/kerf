import {
  type dayPeriods,
  fieldName,
  isSegment,
  segmentText,
  segmentValueText,
  type SegmentPart,
} from '@kerf/veneer-core'

type SegmentViewModel = {
  parts: { readonly value: SegmentPart[] }
  shape: { readonly value: { periods: ReturnType<typeof dayPeriods>; h12: boolean; l: string } }
  onKey: (event: KeyboardEvent) => void
  onLeave: (event: FocusEvent) => void
  onPaste: (event: ClipboardEvent) => void
  setGroup: (node: HTMLDivElement) => HTMLDivElement
}

const keyOf = (p: SegmentPart) => (isSegment(p) ? p.type : `l${p.at}`)

export const segmentView = ({
  model,
  label,
  readonly,
  disabled,
  required,
}: {
  model: SegmentViewModel
  label: () => string | undefined
  readonly: () => boolean | undefined
  disabled: () => boolean | undefined
  required: () => boolean | undefined
}) => {
  const { parts, shape, onKey, onLeave, onPaste, setGroup } = model
  return (
    <div
      ref={setGroup}
      data-part="segments"
      role={label() ? 'group' : undefined}
      aria-label={label()}
      onKeyDown={onKey}
      onFocusOut={onLeave}
      onPaste={onPaste}
    >
      {parts.value.map((p) =>
        isSegment(p) ? (
          <span
            key={keyOf(p)}
            data-part="segment"
            data-type={p.type}
            role={readonly() ? undefined : 'spinbutton'}
            tabindex={disabled() ? undefined : '0'}
            inputmode="numeric"
            aria-label={fieldName(p.type, shape.value.l)}
            aria-valuemin={readonly() ? undefined : p.min}
            aria-valuemax={readonly() ? undefined : p.max}
            aria-valuenow={readonly() || p.value === null ? undefined : p.value}
            aria-valuetext={
              readonly()
                ? undefined
                : segmentValueText(p, shape.value.periods, shape.value.l, shape.value.h12)
            }
            aria-required={required() && !readonly() ? 'true' : undefined}
            aria-disabled={disabled() ? 'true' : undefined}
            data-placeholder={p.value === null && !p.buf ? '' : undefined}
          >
            {segmentText(p, shape.value.periods, shape.value.h12)}
          </span>
        ) : (
          <span key={keyOf(p)} data-part="literal" aria-hidden="true">
            {p.literal}
          </span>
        ),
      )}
    </div>
  )
}
