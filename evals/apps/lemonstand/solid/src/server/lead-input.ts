import { z } from 'zod'

import { INTERESTS, LEARNER_COUNTS, ROLES } from '~/lib/leads'

/* Input schemas. Only the server functions in `./leads` import this file, so zod stays out of the client. */

type Values<T extends readonly { value: string }[]> = [T[number]['value'], ...T[number]['value'][]]
const values = <T extends readonly { value: string }[]>(list: T) =>
  list.map((o) => o.value) as Values<T>

/** A form posts an untouched field as "", which means "not given". */
const blank = (v: unknown) => (v === '' ? undefined : v)

const roleSchema = z.enum(values(ROLES), { error: 'Pick the closest match' })
const interestSchema = z.enum(values(INTERESTS))
const learnerCountSchema = z.enum(values(LEARNER_COUNTS))

const email = z
  .string('Enter a valid email address')
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254)
/** Hidden field real people never fill in; bots usually do. */
const honeypot = z.string().max(500).optional()

export const waitlistInput = z.object({
  email,
  role: z.preprocess(blank, roleSchema.optional()),
  source: z.string().max(64).optional(),
  website: honeypot,
})

export const contactInput = z.object({
  name: z.string('Tell us your name').trim().min(1, 'Tell us your name').max(120),
  email,
  role: z.preprocess(blank, roleSchema),
  organization: z.preprocess(blank, z.string().trim().max(160).optional()),
  interests: z.array(interestSchema).max(INTERESTS.length).default([]),
  learnerCount: z.preprocess(blank, learnerCountSchema.optional()),
  message: z
    .string('A sentence or two helps us reply well')
    .trim()
    .min(10, 'A sentence or two helps us reply well')
    .max(4000),
  website: honeypot,
})

export type WaitlistInput = z.infer<typeof waitlistInput>
export type ContactInput = z.infer<typeof contactInput>
