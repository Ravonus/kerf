import { group } from '@weft-js/core/style'

/** A button. Solid for the main action of a row, ghost for small steppers. */
export const action = group('action', {
  base: { layout: 'inline', justify: 'center', control: 'sm', padInline: 'control', radius: 'control', text: 'button', tone: 'accent', cursor: 'pointer', border: 'none' },
  axes: { emphasis: { solid: { emphasis: 'solid' }, ghost: { emphasis: 'ghost', border: 'tone' } } },
  states: { hover: { emphasis: 'strong' }, disabled: { fade: 'half', cursor: 'blocked' } },
  defaults: { emphasis: 'solid' },
})

/** A labelled form control: the label text above the control. */
export const field = group('field', {
  base: { layout: 'stack', gap: 'hair', text: 'label', ink: 'subtle' },
})

/** A text input or select. */
export const input = group('input', {
  base: { control: 'md', padInline: 'control', radius: 'control', border: 'control', surface: 'base', text: 'body', ink: 'text' },
  states: { focus: { ring: 'focus' } },
})
