import type { NextConfig } from 'next'

const config: NextConfig = {
  // partialPrefetching stays off. With it, an unknown slug gets the fallback shell and a 200 before the page can call notFound(),
  // and the admin and todo variants saw every dynamic page render twice a request in 16.4.3.
  cacheComponents: true,
  partialPrefetching: false,
  poweredByHeader: false,
}

export default config
