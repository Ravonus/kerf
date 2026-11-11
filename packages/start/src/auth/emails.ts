import type { BetterAuthOptions } from 'better-auth'
import { sendEmail } from '../email'

type Mailed = Pick<BetterAuthOptions, 'emailAndPassword' | 'emailVerification'>
interface Link {
  user: { email: string; name?: string | null }
  url: string
}

const greet = (user: Link['user']) => (user.name ? `Hi ${user.name},` : 'Hi,')

/**
 * Better Auth's reset and verification emails, sent through `sendEmail` (the app's mailer, `RESEND_API_KEY`,
 * `SMTP_URL`, or the console in dev) unless the app passed its own. The mailer is found when one is sent, not here.
 */
export function mailed(options: BetterAuthOptions | undefined): Mailed {
  const password = { enabled: true, ...options?.emailAndPassword }
  return {
    emailAndPassword: {
      ...password,
      sendResetPassword:
        password.sendResetPassword ??
        (async ({ user, url }: Link) => {
          await sendEmail({
            to: user.email,
            subject: 'Reset your password',
            text: `${greet(user)}\n\nOpen this link to choose a new password:\n${url}\n\nIf you didn't ask for this, ignore this email.`,
          })
        }),
    },
    emailVerification: {
      ...options?.emailVerification,
      sendVerificationEmail:
        options?.emailVerification?.sendVerificationEmail ??
        (async ({ user, url }: Link) => {
          await sendEmail({
            to: user.email,
            subject: 'Confirm your email',
            text: `${greet(user)}\n\nOpen this link to confirm your email address:\n${url}`,
          })
        }),
    },
  }
}
