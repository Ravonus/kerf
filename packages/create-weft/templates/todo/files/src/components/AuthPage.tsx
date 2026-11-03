import { AuthScreen, Heading, Stack, Text } from '@weft-js/warp'
import { Logo } from '#/components/Logo'

export function AuthPage({ title, lede, children }: { title: string; lede: string; children?: unknown }) {
  return (
    <AuthScreen name="Daybook" logo={<Logo />} quote="A short list, kept honestly, beats a long one kept in your head.">
      <Stack gap="group">
        <span class="auth-mark"><Logo /> Daybook</span>
        <Stack gap="tight">
          <Heading level={1} role="title">{title}</Heading>
          <Text subtle>{lede}</Text>
        </Stack>
        {children}
      </Stack>
    </AuthScreen>
  )
}
