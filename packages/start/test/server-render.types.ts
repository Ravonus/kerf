// Strict consumers of Start's Node renderer need declarations for the JavaScript helpers it imports.
import { keptSheets, pageStyles, sheetId } from '../src/inline.mjs'
import { pick, planSheets } from '../src/sheets.mjs'
import { cardResponse, previewHtml, renderCard } from '../src/og/index.mjs'

/** Compile-time coverage for the style helpers used by cold and warm page rendering. */
export function typedPageStyles() {
  const key: string = sheetId('/base.css')
  const kept: Set<string> | undefined = keptSheets(null)
  const styles = pageStyles({ inline: {} }, [{ href: '/base.css' }], '<main></main>')
  const html: string = styles.head + styles.late([], '')
  const selected = pick({ routes: [] }, ['/base.css'])
  const plan = planSheets([['/base.css']], () => 'main{}')
  return { key, kept, html, selected, plan }
}

/** Encoded PNGs are a valid Response body and preview HTML uses the same font records. */
export function typedShareCard() {
  const bytes: Promise<Uint8Array<ArrayBuffer>> = renderCard('<div>Card</div>')
  const html: string = previewHtml('<div>Card</div>')
  return { html, response: bytes.then((body) => cardResponse({ body, type: 'image/png' })) }
}
