import { XIcon } from '@weft-js/warp-icons'

/**
 * The cross inside a close button: the glyph, and an accent copy over it that the hover wipes in (button.css). Both
 * are the same XIcon, so a themed icon set changes them together.
 */
export function CloseX() {
  return (
    <>
      <XIcon />
      <XIcon data-part="ink" />
    </>
  )
}
