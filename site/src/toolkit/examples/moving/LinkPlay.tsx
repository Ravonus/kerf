import { Link } from '@weft-js/warp'

export const LinkPlay = (p: { children: string; subtle: boolean; external: boolean }) => (
  <Link
    href={p.external ? 'https://example.com' : '/toolkit/button'}
    subtle={p.subtle}
    external={p.external}
  >
    {p.children}
  </Link>
)
