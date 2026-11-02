/** The text with HTML entities decoded. */
export function decode(text: string): string
/** One line of plain text: whitespace collapsed, no list marker in front. */
export function cleanText(text: string): string
/** At most `max` characters, cut at a sentence or a word. */
export function truncate(text: string, max?: number): string
/** `undefined`, or why this text isn't a description a person would read. */
export function descriptionProblem(text: string): string | undefined
/** A page's title and description, as a person would pick them out of its HTML. */
export function pageText(html: string): { title?: string; description?: string }
/** The site's URL, from its config or from what the host says about this deploy. */
export function deployUrl(site: { url?: string | undefined } | undefined, env?: Record<string, string | undefined>): string | undefined
/** The card title's font size, smaller for a longer title. */
export function cardTitleSize(title: string): number
/** `paths` in pages that each fit in a response header. */
export function pathPages(paths: string[], max?: number): string[][]
