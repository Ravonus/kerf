import { state } from '@kerf/core'
import { Row, Toggle } from '@kerf/veneer'

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
