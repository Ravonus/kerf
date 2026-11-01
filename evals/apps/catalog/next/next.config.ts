import type { NextConfig } from 'next'

const config: NextConfig = {
  // partialPrefetching stays off: with it, the first hit on an unknown slug gets the build's fallback shell and a 200 before the page
  // can call notFound(). The contract needs a real 404.
  cacheComponents: true,
  partialPrefetching: false,
  poweredByHeader: false,
}

export default config
