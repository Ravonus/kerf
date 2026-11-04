import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const read = () =>
  createEnv({
    server: {
      DATABASE_URL: z.url(),
      // Outbound mail. Sends are skipped, loudly, when unset.
      SMTP_HOST: z.string().optional(),
      SMTP_PORT: z.coerce.number().default(465),
      SMTP_USER: z.string().optional(),
      SMTP_PASSWORD: z.string().optional(),
      MAIL_FROM: z.string().default('Lemonstand <hello@lemonstand.ai>'),
      MAIL_REPLY_TO: z.string().default('hello@lemonstand.ai'),
      /** Where new signup and contact alerts go. Comma-separate for several inboxes. */
      LEAD_ALERT_EMAIL: z.string().optional(),
      SITE_URL: z.url().default('https://lemonstand.ai'),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
  })

let cached: ReturnType<typeof read> | undefined

/** Read on first use, so pages render on a server with no database or mail configured. */
export const env = () => (cached ??= read())
