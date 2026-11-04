'use server'

import { getRequestEvent } from 'solid-js/web'
import { z } from 'zod'

import { db } from '~/db/index.server'
import { contactMessages, waitlistSignups } from '~/db/schema'
import { contactInput, waitlistInput } from './lead-input'
import { sendContactMail, sendWaitlistMail } from './mail/lead-mail'
import { clientIp, rateLimit } from './rate-limit'

const MINUTE = 60_000
const SLOW_DOWN = "That's a lot of lemonade. Give it a few minutes and try again."

export type Failure = { ok: false; errors: Record<string, string>; message?: string }

const invalid = (error: z.ZodError): Failure => {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '')
    if (field && !(field in errors)) errors[field] = issue.message
  }
  return { ok: false, errors }
}

const failed = (message: string): Failure => ({ ok: false, errors: {}, message })

/** Drizzle wraps what the driver throws with the query text; the visitor sees the driver's error, never the SQL. */
const saving = async <T>(write: () => Promise<T>): Promise<T | Failure> => {
  try {
    return await write()
  } catch (error) {
    const cause = (error as Error).cause
    return failed((cause instanceof Error ? cause : (error as Error)).message)
  }
}

const isFailure = (value: unknown): value is Failure => (value as Failure | undefined)?.ok === false

const requestHeaders = () => getRequestEvent()!.request.headers
const allowed = (headers: Headers, bucket: string, limit: number) =>
  rateLimit(`${bucket}:${clientIp(headers)}`, limit, 10 * MINUTE)
const userAgent = (headers: Headers) => headers.get('user-agent')?.slice(0, 512) ?? null

/** Fire and forget, after the answer. `sendMail` never rejects for a failed send. */
const later = (send: () => Promise<unknown>) => {
  void send().catch((error) => console.error('[mail] failed', error))
}

export async function joinWaitlist(form: FormData) {
  const parsed = waitlistInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return invalid(parsed.error)
  const input = parsed.data

  // Honeypot tripped: pretend it worked so bots learn nothing.
  if (input.website) return { ok: true as const, alreadyJoined: false, email: input.email }
  const headers = requestHeaders()
  if (!allowed(headers, 'waitlist', 8)) return failed(SLOW_DOWN)

  const rows = await saving(() =>
    db()
      .insert(waitlistSignups)
      .values({
        email: input.email,
        role: input.role ?? null,
        source: input.source ?? null,
        userAgent: userAgent(headers),
      })
      .onConflictDoNothing({ target: waitlistSignups.email })
      .returning({ id: waitlistSignups.id }),
  )
  if (isFailure(rows)) return rows
  const row = rows[0]

  // Only brand-new signups get mail; re-joining stays quiet.
  if (row) later(() => sendWaitlistMail(input))

  return { ok: true as const, alreadyJoined: !row, email: input.email }
}

export async function contact(form: FormData) {
  const parsed = contactInput.safeParse({
    ...Object.fromEntries(form),
    interests: form.getAll('interests[]'),
  })
  if (!parsed.success) return invalid(parsed.error)
  const input = parsed.data

  if (input.website) return { ok: true as const, name: input.name, email: input.email }
  const headers = requestHeaders()
  if (!allowed(headers, 'contact', 4)) return failed(SLOW_DOWN)

  const saved = await saving(async () => {
    // Anyone who reaches out is also first in line for early access.
    await db()
      .insert(waitlistSignups)
      .values({
        email: input.email,
        role: input.role,
        source: 'contact',
        userAgent: userAgent(headers),
      })
      .onConflictDoNothing({ target: waitlistSignups.email })

    await db()
      .insert(contactMessages)
      .values({
        name: input.name,
        email: input.email,
        role: input.role,
        organization: input.organization ?? null,
        interests: input.interests,
        learnerCount: input.learnerCount ?? null,
        message: input.message,
        userAgent: userAgent(headers),
      })
  })
  if (isFailure(saved)) return saved

  later(() => sendContactMail(input))

  return { ok: true as const, name: input.name, email: input.email }
}
