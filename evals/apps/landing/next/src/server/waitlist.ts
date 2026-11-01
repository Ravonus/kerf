'use server'

import { z } from 'zod'
import { db } from '@/db'
import { waitlist } from '@/db/schema'

export type JoinState = { joined: boolean; error?: string }

const email = z.string().trim().toLowerCase().pipe(z.email())

export async function joinWaitlist(_: JoinState, form: FormData): Promise<JoinState> {
  const parsed = email.safeParse(form.get('email'))
  if (!parsed.success) return { joined: false, error: 'Enter a valid email address.' }
  try {
    await db.insert(waitlist).values({ email: parsed.data }).onConflictDoNothing()
    return { joined: true }
  } catch (e) {
    console.error(e)
    return { joined: false, error: "We couldn't save that. Please try again." }
  }
}
