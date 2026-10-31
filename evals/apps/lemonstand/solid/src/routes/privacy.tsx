import { LegalPage } from "~/components/site/legal-page";
import { Seo } from "~/components/site/seo";
import { privacy } from "~/content/legal";

export default function Page() {
  return (
    <>
      <Seo title={privacy.title} description={privacy.intro} />
      <LegalPage doc={privacy} />
    </>
  );
}
