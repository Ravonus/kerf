import { state } from '@weft-js/core'
import { Button, Heading, Input, Shell } from '@weft-js/warp'
import { AppWindow, FOCUS_STEPS } from './shared'

export function ShellFocus() {
  const step = state(1)
  const next = () => (step.value = step.value === 3 ? 1 : step.value + 1)
  return (
    <AppWindow height={420}>
      <Shell
        island
        label="New project"
        variant="focus"
        title="New project"
        step={`Step ${step.value} of 3`}
        close={{ label: 'Close', onClick: () => (step.value = 1) }}
        dock={<Button onClick={next}>{step.value === 3 ? 'Create project' : 'Continue'}</Button>}
      >
        <Heading level={1} role="heading">
          {FOCUS_STEPS[step.value - 1]}
        </Heading>
        <Input label="Repository" defaultValue="weft/storefront" />
      </Shell>
    </AppWindow>
  )
}
