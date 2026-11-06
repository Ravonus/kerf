import { FnError } from '@weft-js/start'

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin)
    throw new FnError({ message: 'Cross-origin write refused' }, 403)
}
