import type { NextConfig } from 'next'

const config: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  redirects: async () => [{ source: '/', destination: '/todos', permanent: false }],
}

export default config
