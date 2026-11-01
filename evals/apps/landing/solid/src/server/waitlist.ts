"use server";

import { redirect } from "@solidjs/router";
import { z } from "zod";

import { db } from "~/db/index.server";
import { waitlist } from "~/db/schema";
import { errors } from "~/lib/errors";

const Email = z.string().trim().toLowerCase().pipe(z.email());

export async function joinWaitlist(form: FormData) {
  const email = Email.safeParse(form.get("email"));
  // A post the router didn't take. The home page is a file, so the flash cookie has nothing to render it; `/waitlist` does.
  const fail = (status: keyof typeof errors) => (form.has("native") ? redirect(`/waitlist?status=${status}`) : { error: errors[status] });
  if (!email.success) return fail("invalid");
  try {
    await db().insert(waitlist).values({ email: email.data }).onConflictDoNothing();
  } catch (e) {
    console.error(e);
    return fail("failed");
  }
  return redirect("/joined");
}
