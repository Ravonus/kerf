import { Link } from '@weft-js/warp'

export const LinkPlay = ({
  children,
  subtle,
  external,
}: {
  children: string
  subtle: boolean
  external: boolean
}) => (
  <Link
    href={
      external ? 'https://example.com' : '/toolkit/button'
    }
    subtle={subtle}
    external={external}
  >
    {children}
  </Link>
)
