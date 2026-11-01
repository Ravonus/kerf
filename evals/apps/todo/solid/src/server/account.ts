"use server";

import { redirect } from "@solidjs/router";
import { APIError } from "better-auth/api";
import { getRequestEvent } from "solid-js/web";

import { z } from "zod";

import { auth, currentSession } from "./auth.server";

const credentials = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1) });

export async function loadViewer() {
  const session = await currentSession();
  return session && { name: session.user.name, email: session.user.email };
}

export async function signIn(form: FormData | URLSearchParams) {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  try {
    const { headers } = await auth.api.signInEmail({ body: parsed.data, returnHeaders: true });
    return redirect("/todos", { headers });
  } catch (e) {
    if (e instanceof APIError) return { error: "That email and password don't match." };
    console.error(e);
    return { error: "We couldn't sign you in. Please try again in a moment." };
  }
}

export async function signOut() {
  const { headers } = await auth.api.signOut({ headers: getRequestEvent()!.request.headers, returnHeaders: true });
  return redirect("/login", { headers });
}
