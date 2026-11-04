'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/db'
import { waitlist } from '@/db/schema'

export type JoinState = { error?: string }

const email = z.string().trim().toLowerCase().pipe(z.email())

export async function joinWaitlist(_: JoinState, form: FormData): Promise<JoinState> {
  const parsed = email.safeParse(form.get('email'))
  if (!parsed.success) return { error: "That doesn't look like an email address." }
  try {
    await db.insert(waitlist).values({ email: parsed.data }).onConflictDoNothing()
  } catch (e) {
    console.error(e)
    return { error: "Your email wasn't saved. Please try again in a moment." }
  }
  redirect('/joined')
}
