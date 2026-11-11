import { state } from '@kerf-js/core'
import { Row, Toggle } from '@kerf-js/veneer'

export function ToggleToolbar() {
  const bold = state(true)
  const italic = state(false)
  const code = state(false)
  return (
    <Row gap="tight">
      <Toggle
        pressed={bold.value}
        onClick={() => (bold.value = !bold.value)}
      >
        Bold
      </Toggle>
      <Toggle
        pressed={italic.value}
        onClick={() => (italic.value = !italic.value)}
      >
        Italic
      </Toggle>
      <Toggle
        pressed={code.value}
        onClick={() => (code.value = !code.value)}
      >
        Code
      </Toggle>
    </Row>
  )
}
