import { AuthScreen, Heading, Stack, Text } from '@kerf-js/veneer'
import { Logo } from '#/components/Logo'

export function AuthPage({
  title,
  lede,
  children,
}: {
  title: string
  lede: string
  children?: unknown
}) {
  return (
    <AuthScreen
      name="Backroom"
      logo={<Logo />}
      quote="Every order, every customer, one quiet room behind the shop."
    >
      <Stack gap="group">
        <span class="auth-mark">
          <Logo /> Backroom
        </span>
        <Stack gap="tight">
          <Heading level={1} role="title">
            {title}
          </Heading>
          <Text subtle>{lede}</Text>
        </Stack>
        {children}
      </Stack>
    </AuthScreen>
  )
}
