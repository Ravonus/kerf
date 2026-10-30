// Config-level page-metadata checks (research 20 §6). Without routing they see only `site`: the defaults every page
// starts from. Route metas (Phase 3) will run the same checks on each route's merged result.

const absolute = /^(https?:)?\/\//

/** @param {import('./config').SiteConfig} site @param {(code: string, why: string, near: string | null) => void} report */
export function checkSite(site, report) {
  const image = typeof site.image === 'object' ? site.image.url : site.image
  if (image && !site.url && !absolute.test(image)) {
    const what = image === 'auto' ? 'The generated card (`image: \'auto\'`) is served from a relative URL' : `\`site.image\` (\`${image}\`) is relative`
    report('H001', `${what} and \`site.url\` is not set, so og:image (and canonical, og:url) can't be absolute. Crawlers don't resolve relative URLs.`, 'image')
  }
  if (!site.description?.trim()) report('H003', 'Pages have no description: `site.description` is not set and no route overrides it yet.', 'site')
  // The default page title is `name`; a template's fixed part is in every other title.
  const fixed = site.title ? site.title.replace('%s', '').length : 0
  if (site.name && site.name.length > 60) report('H004', `The default title \`${site.name}\` is ${site.name.length} characters (over 60).`, 'name')
  if (fixed > 40) report('H004', `The title template's fixed part is ${fixed} characters, leaving under 20 of 60 for the page title.`, 'title')
  if (site.description && site.description.length > 160) report('H004', `\`site.description\` is ${site.description.length} characters (over 160).`, 'description')
}
