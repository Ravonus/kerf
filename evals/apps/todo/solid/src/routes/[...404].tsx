import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { HttpStatusCode } from "@solidjs/start";

export default function NotFound() {
  return (
    <main class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <Title>Page not found · Emberline</Title>
      <HttpStatusCode code={404} />
      <h1 class="text-2xl font-semibold tracking-tight">Nothing here</h1>
      <p class="text-muted">That page doesn't exist.</p>
      <A href="/todos" class="font-medium text-accent hover:underline" activeClass="" inactiveClass="">
        Back to your todos
      </A>
    </main>
  );
}
