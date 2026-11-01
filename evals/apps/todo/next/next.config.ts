import type { NextConfig } from 'next'

const config: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  redirects: async () => [{ source: '/', destination: '/todos', permanent: false }],
}

export default config
