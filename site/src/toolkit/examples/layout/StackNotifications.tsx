import { state } from '@weft-js/core'
import { Heading, Stack, Switch, Text } from '@weft-js/warp'

export function StackNotifications() {
  const deploys = state(true)
  const failures = state(true)
  const digest = state(false)
  return (
    <Stack gap="group">
      <Stack gap="hair">
        <Heading level={3}>Notifications</Heading>
        <Text subtle>Choose what weft tells you about.</Text>
      </Stack>
      <Stack divided gap="related">
        <Switch
          checked={deploys.value}
          onChange={() => (deploys.value = !deploys.value)}
          hint="When a deploy goes live."
        >
          Deploys
        </Switch>
        <Switch
          checked={failures.value}
          onChange={() => (failures.value = !failures.value)}
          hint="When a build or health check fails."
        >
          Failures
        </Switch>
        <Switch
          checked={digest.value}
          onChange={() => (digest.value = !digest.value)}
          hint="One email on Monday morning."
        >
          Weekly digest
        </Switch>
      </Stack>
    </Stack>
  )
}
