import { Hero } from '~/components/site/hero'
import {
  Audiences,
  Contact,
  FinalCta,
  Faq,
  HowItWorks,
  MeetLemon,
  Programs,
  Safety,
  Sponsor,
} from '~/components/site/sections'
import { Seo } from '~/components/site/seo'
import { SiteFooter, SiteHeader, SkipLink } from '~/components/site/site-chrome'

export default function Home() {
  return (
    <>
      <Seo />
      <SkipLink />
      <SiteHeader />
      <main id="main">
        <Hero />
        <HowItWorks />
        <MeetLemon />
        <Programs />
        <Sponsor />
        <Audiences />
        <Safety />
        <Faq />
        <Contact />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
