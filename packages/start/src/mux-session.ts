/** What a tab compares, to learn a socket opened before it signed in isn't its own. Opaque, and only the same browser sees it. */
export async function sessionOf(ctx: unknown) {
  const id = String((ctx as { user?: { id?: string | number } })?.user?.id ?? '')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`kerf:${id}`))
  return btoa(String.fromCharCode(...new Uint8Array(hash).slice(0, 12)))
}
