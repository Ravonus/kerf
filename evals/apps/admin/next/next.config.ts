import type { NextConfig } from 'next'

const config: NextConfig = {
  // Not partialPrefetching: in 16.4.3 it renders every dynamic page twice a request, and the todo variant leaves it off too.
  cacheComponents: true,
  poweredByHeader: false,
  redirects: async () => [{ source: '/', destination: '/admin', permanent: false }],
}

export default config
