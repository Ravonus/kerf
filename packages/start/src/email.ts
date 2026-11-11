// `@kerf/start/email`: `sendEmail()` from any server code, through the mailer `src/email.server.ts` exports, or
// the one the environment names: `RESEND_API_KEY` sends through Resend, `SMTP_URL` over SMTP (nodemailer), and dev with
// neither prints each message to the server log. Auth's verification and reset emails go the same way.
import { StartError } from './data'

/** One email. `from` defaults to the mailer's, then `EMAIL_FROM`. Give `text`, `html` or both. */
export interface EmailMessage {
  to: string | string[]
  subject: string
  text?: string
  html?: string
  from?: string
  replyTo?: string
}

/** Something that sends email: what `src/email.server.ts` default-exports. */
export interface Mailer {
  name: string
  send(message: EmailMessage): Promise<void>
}

const fromOf = (m: EmailMessage, fallback?: string) => {
  const from = m.from ?? fallback ?? process.env.EMAIL_FROM
  if (!from)
    throw new StartError(
      'E002',
      `the email "${m.subject}" has no sender`,
      'set `EMAIL_FROM` (`Acme <hello@acme.dev>`), or pass `from` to the mailer or the message',
    )
  return from
}

/** Resend's HTTP API, with no package: `RESEND_API_KEY` unless you pass `apiKey`. */
export function resendMailer(options: { apiKey?: string; from?: string } = {}): Mailer {
  return {
    name: 'resend',
    async send(m) {
      const key = options.apiKey ?? process.env.RESEND_API_KEY
      if (!key) throw new StartError('E003', 'Resend needs an API key', 'set `RESEND_API_KEY`')
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: fromOf(m, options.from),
          to: m.to,
          subject: m.subject,
          ...(m.text !== undefined && { text: m.text }),
          ...(m.html !== undefined && { html: m.html }),
          ...(m.replyTo && { reply_to: m.replyTo }),
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok)
        throw new StartError(
          'E003',
          `Resend refused "${m.subject}": ${res.status} ${(await res.text()).slice(0, 300)}`,
          'check the API key and that the sender’s domain is verified in Resend',
        )
    },
  }
}

/**
 * SMTP through nodemailer (`pnpm add nodemailer`): `SMTP_URL` (`smtps://user:pass@smtp.example.com:465`) unless you
 * pass `url`. One connection pool per mailer.
 */
export function smtpMailer(options: { url?: string; from?: string } = {}): Mailer {
  let transport: Promise<{ sendMail(m: object): Promise<unknown> }> | undefined
  const open = () =>
    (transport ??= (async () => {
      const url = options.url ?? process.env.SMTP_URL
      if (!url) throw new StartError('E004', 'SMTP needs a URL', 'set `SMTP_URL`')
      let nodemailer: { createTransport(url: string): { sendMail(m: object): Promise<unknown> } }
      try {
        // Named at runtime, so an app without it builds; the build traces it when the app has it (app.mjs).
        const name = 'nodemailer'
        nodemailer = ((await import(/* @vite-ignore */ name)) as { default: typeof nodemailer })
          .default
      } catch {
        throw new StartError('E004', 'SMTP needs nodemailer', '`pnpm add nodemailer`')
      }
      const pooled = new URL(url)
      pooled.searchParams.set('pool', 'true')
      return nodemailer.createTransport(pooled.toString())
    })().catch((e) => {
      transport = undefined
      throw e
    }))
  return {
    name: 'smtp',
    async send(m) {
      await (
        await open()
      ).sendMail({
        from: fromOf(m, options.from),
        to: m.to,
        subject: m.subject,
        text: m.text,
        html: m.html,
        replyTo: m.replyTo,
      })
    },
  }
}

/** Dev: each message on the server log instead of sent, links and all, so sign-up and reset work with no provider. */
export function consoleMailer(): Mailer {
  return {
    name: 'console',
    send(m) {
      console.info(
        `[kerf] email to ${[m.to].flat().join(', ')}: ${m.subject}\n${m.text ?? m.html ?? ''}\n`,
      )
      return Promise.resolve()
    },
  }
}

let chosen: Mailer | undefined
let dev = false

/** The server sets this from `src/email.server.ts` (or nothing) when it starts. */
export function useMailer(mailer: Mailer | undefined, isDev: boolean) {
  chosen = mailer
  dev = isDev
}

/** The mailer in use: the app's, else Resend or SMTP when the environment names one, else the log in dev. */
export function currentMailer(): Mailer | undefined {
  if (chosen) return chosen
  if (process.env.RESEND_API_KEY) return (chosen = resendMailer())
  if (process.env.SMTP_URL) return (chosen = smtpMailer())
  return dev ? consoleMailer() : undefined
}

/** Send one email through the app's mailer. E001 when production has none. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const mailer = currentMailer()
  if (!mailer)
    throw new StartError(
      'E001',
      `no way to send "${message.subject}"`,
      'set `RESEND_API_KEY` or `SMTP_URL`, or default-export a mailer from `src/email.server.ts`',
    )
  await mailer.send(message)
}
