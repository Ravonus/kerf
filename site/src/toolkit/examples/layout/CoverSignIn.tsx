import { state } from '@weft-js/core'
import { Button, Center, Cover, Heading, Input, Row, Stack, Text } from '@weft-js/warp'
import { SCREEN } from './shared'

export function CoverSignIn() {
  const sent = state(false)
  const send = (e: Event) => {
    e.preventDefault()
    sent.value = true
  }
  return (
    <Cover style={`${SCREEN};--warp-viewport-block:520px`} gap="group">
      <Row justify="between" gap="tight">
        <Text role="heading">weft</Text>
        <Button emphasis="ghost" tone="neutral" size="sm">
          Help
        </Button>
      </Row>
      <Center data-part="center" max="narrow">
        {sent.value ? (
          <Stack gap="related" align="center">
            <Heading level={3}>Check your email</Heading>
            <Text subtle>We sent a sign-in link to you.</Text>
            <Button emphasis="ghost" tone="neutral" onClick={() => (sent.value = false)}>
              Use another address
            </Button>
          </Stack>
        ) : (
          <Stack as="form" gap="group" onSubmit={send}>
            <Stack gap="hair">
              <Heading level={3}>Sign in to weft</Heading>
              <Text subtle>We'll email you a link. No password needed.</Text>
            </Stack>
            <Input label="Work email" type="email" required />
            <Button type="submit" full>
              Email me a link
            </Button>
          </Stack>
        )}
      </Center>
      <Text role="caption" subtle>
        © 2026 weft
      </Text>
    </Cover>
  )
}
