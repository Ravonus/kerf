import { Link, Meta, Title } from '@solidjs/meta'
import { useLocation } from '@solidjs/router'

const SITE_URL = 'https://lemonstand.ai'
const SITE_TITLE = 'Lemonstand: entrepreneurship for young people, with an AI coach'
const SITE_DESCRIPTION =
  'Lemonstand helps kids and teens turn an idea into a real small business. It runs as a library club, a classroom course, or a district-wide program, with an AI coach that asks good questions while kids do the work. Join early access.'

/** A page's head. With no `title` it's the home page; otherwise the page's title and intro, under the site's name. */
export function Seo(props: { title?: string; description?: string }) {
  const title = () => (props.title ? `${props.title} · Lemonstand` : SITE_TITLE)
  const description = () => props.description ?? SITE_DESCRIPTION
  const location = useLocation()
  const url = () => `${SITE_URL}${location.pathname}`
  return (
    <>
      <Title>{title()}</Title>
      <Meta name="description" content={description()} />
      <Link rel="canonical" href={url()} />
      <Meta property="og:type" content="website" />
      <Meta property="og:site_name" content="Lemonstand" />
      <Meta property="og:title" content={title()} />
      <Meta property="og:description" content={description()} />
      <Meta property="og:url" content={url()} />
      <Meta property="og:locale" content="en_US" />
      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content={SITE_TITLE} />
      <Meta name="twitter:description" content={SITE_DESCRIPTION} />
      <Link rel="icon" href="/icon.svg" />
      <Meta name="application-name" content="Lemonstand" />
      <Meta
        name="keywords"
        content="youth entrepreneurship,kids business program,entrepreneurship curriculum,library program,AI literacy,after-school program,school district"
      />
      <Meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbf9f4" />
      <Meta name="theme-color" media="(prefers-color-scheme: dark)" content="#100e0b" />
    </>
  )
}
