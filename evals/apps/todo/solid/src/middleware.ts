import { createMiddleware } from "@solidjs/start/middleware";
import { getSessionCookie } from "better-auth/cookies";
import { redirect } from "h3";

// A quick answer for the signed-out, before any shell is sent. currentSession() does the real check.
export default createMiddleware([
  (event) => {
    if (event.url.pathname === "/todos" && !getSessionCookie(event.req.headers)) return redirect("/login");
  },
]);
