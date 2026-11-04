import { LegalPage } from '~/components/site/legal-page'
import { Seo } from '~/components/site/seo'
import { terms } from '~/content/legal'

export default function Page() {
  return (
    <>
      <Seo title={terms.title} description={terms.intro} />
      <LegalPage doc={terms} />
    </>
  )
}
