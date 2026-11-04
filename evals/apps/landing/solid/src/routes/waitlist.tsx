import { useSearchParams } from '@solidjs/router'

import { Seo } from '~/components/seo'
import { WaitlistForm } from '~/components/waitlist-form'
import { errors } from '~/lib/errors'

/** Where a refused form post without the router lands: rendered per request, as the home page isn't. */
export default function Waitlist() {
  const [params] = useSearchParams()
  const error = () => errors[params.status as keyof typeof errors]
  return (
    <section class="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <Seo title="Waitlist · Emberline" description="Join the Emberline waitlist." />
      <h1 class="mb-6 text-4xl font-extrabold tracking-tight">Join the waitlist</h1>
      <WaitlistForm error={error()} />
    </section>
  )
}
