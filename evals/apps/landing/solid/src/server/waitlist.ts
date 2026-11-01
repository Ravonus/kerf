"use server";

import { redirect } from "@solidjs/router";
import { z } from "zod";

import { db } from "~/db/index.server";
import { waitlist } from "~/db/schema";

const Email = z.email();

export async function joinWaitlist(form: FormData) {
  const email = Email.safeParse(String(form.get("email") ?? "").trim());
  // A post the router didn't take. The home page is a file, so the flash cookie has nothing to render it; `/waitlist` does.
  const native = form.has("native");
  if (!email.success) {
    if (native) return redirect("/waitlist?status=invalid");
    return { error: "That doesn't look like an email address." };
  }
  await db().insert(waitlist).values({ email: email.data }).onConflictDoNothing();
  return native ? redirect("/waitlist?status=joined") : { joined: true };
}
