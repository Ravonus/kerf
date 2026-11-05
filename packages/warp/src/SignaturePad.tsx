import { uid, type Stroke } from '@weft-js/warp-core'
import { flush } from '@weft-js/core'
import { Field, type FieldShell } from './Field'
import { bindable, type Bindable } from './Picker'
import { signatureState } from './SignaturePad/state'
import { SignatureControl, SignatureFooter } from './SignaturePad/view'
import '@weft-js/warp-core/styles/rich/signature.css'

/** A signature, drawn or typed, with the SVG to show it. */
export type SignatureValue = {
  method: 'drawn' | 'typed'
  strokes?: Stroke[]
  text?: string | undefined
  svg: string
}
/** Props for SignaturePad. */
export type SignaturePadProps = FieldShell & Bindable<SignatureValue | null>

/**
 * SignaturePad (04 §4): a canvas redrawn from its stored points on resize and theme change, with Undo and Clear. Typing
 * the name is the mandatory alternative (WCAG 2.1.1, 2.5.1), so keyboard and switch users can sign.
 */
export function SignaturePad({
  value,
  defaultValue,
  onValueChange,
  label,
  hint,
  ...rest
}: SignaturePadProps) {
  const id = uid('sig')
  const v = bindable<SignatureValue | null>(
    () => value,
    () => defaultValue,
    null,
    () => onValueChange,
  )
  const view = signatureState(v)
  return (
    <div data-scope="signature" class="stack">
      <div class="row" style="justify-content:flex-end">
        <div class="seg" role="radiogroup" aria-label="Signing method">
          <label>
            <input
              type="radio"
              name={`${id}-m`}
              checked={view.method.value === 'draw'}
              onChange={() => view.pick('draw')}
            />
            <i>Draw</i>
          </label>
          <label>
            <input
              type="radio"
              name={`${id}-m`}
              checked={view.method.value === 'type'}
              onChange={() => view.pick('type')}
            />
            <i>Type</i>
          </label>
        </div>
      </div>
      <Field
        {...rest}
        group
        label={label}
        hint={hint ?? 'Draw with a finger, a pen or a mouse, or switch to Type.'}
        filled={view.has.value}
        reset={() => {
          v.reset()
          view.strokes.value = view.start?.strokes ?? []
          view.typed.value = view.start?.text ?? ''
          view.method.value = view.start?.method === 'typed' ? 'type' : 'draw'
          flush()
          view.draw()
        }}
        control={() => <SignatureControl view={view} />}
      />
      <SignatureFooter view={view} />
    </div>
  )
}
