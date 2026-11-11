import { state } from '@kerf/core'
import {
  AuthDone,
  Button,
  InviteAccept,
  MagicLinkSent,
  ResetPassword,
  Stack,
  Text,
} from '@kerf/veneer'
import { PEOPLE } from '../../world'

const resendLede =
  'Press Resend link to stand in for the email.'

const memberDescription =
  'Members can deploy and edit projects.'

export function MagicLinkSentInbox() {
  const email = PEOPLE[2]!.email
  const changing = state(false)
  return (
    <>
      {changing.value ? (
        <Button
          emphasis="outline"
          tone="neutral"
          onClick={() => (changing.value = false)}
        >
          Back to the sent screen
        </Button>
      ) : (
        <MagicLinkSent
          heading="h3"
          email={email}
          resendIn={15}
          onResend={() => {}}
          onChangeEmail={() => (changing.value = true)}
        />
      )}
    </>
  )
}

export function ResetPasswordSteps() {
  const stage = state<
    'request' | 'sent' | 'password' | 'done'
  >('request')
  return (
    <>
      {stage.value === 'request' && (
        <ResetPassword
          heading="h3"
          onSubmit={() => (stage.value = 'sent')}
          onBack={() => {}}
        />
      )}
      {stage.value === 'sent' && (
        <MagicLinkSent
          heading="h3"
          title="Check your inbox"
          email="priya@kerf.dev"
          lede={resendLede}
          onResend={() => (stage.value = 'password')}
          resendIn={0}
          onChangeEmail={() => (stage.value = 'request')}
        />
      )}
      {stage.value === 'password' && (
        <ResetPassword
          heading="h3"
          stage="password"
          onSubmit={() => (stage.value = 'done')}
        />
      )}
      {stage.value === 'done' && (
        <AuthDone
          heading="h3"
          title="Password changed"
          lede="Use the new one next time."
          delay={2400}
          onContinue={() => (stage.value = 'request')}
        />
      )}
    </>
  )
}

export function InviteAcceptWorkspace() {
  const answer = state('')
  return (
    <>
      {answer.value ? (
        <Stack
          gap="related"
          align="center"
        >
          <Text>{answer.value}</Text>
          <Button
            size="sm"
            emphasis="ghost"
            tone="neutral"
            onClick={() => (answer.value = '')}
          >
            Show it again
          </Button>
        </Stack>
      ) : (
        <InviteAccept
          heading="h3"
          inviter="Mara Lindqvist"
          org="kerf"
          role="Member"
          email="dara@kerf.dev"
          description={memberDescription}
          onAccept={() => (answer.value = 'Joined kerf.')}
          onDecline={() =>
            (answer.value = 'Invite declined.')
          }
          onOtherAccount={() => {}}
        />
      )}
    </>
  )
}

export const AuthDoneSignedIn = () => (
  <AuthDone
    heading="h3"
    title="You're in"
    lede="Signed in as mara@kerf.dev."
    delay={3600000}
  />
)
