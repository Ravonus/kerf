import type { Link, VerifyResult } from '../verify'

export function skipper(untested: VerifyResult['untested']) {
  return (links: Link[], why: string) => {
    for (const link of links) untested.push({ link, why })
  }
}

export function skipWithoutUrl(
  url: string | undefined,
  sql: unknown,
  skip: (links: Link[], why: string) => void,
) {
  if (!url)
    skip(
      sql ? ['app', 'poke', 'refetch', 'denied'] : ['app'],
      'no URL target: the database half was tested, not the running app. Set `WEFT_STAGING_URL` or `verify.url`',
    )
}
