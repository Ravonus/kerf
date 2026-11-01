export function decode(text: string): string
export function cleanText(text: string): string
export function truncate(text: string, max?: number): string
export function descriptionProblem(text: string): string | undefined
export function pageText(html: string): { title?: string; description?: string }
export function deployUrl(site: { url?: string } | undefined, env?: Record<string, string | undefined>): string | undefined
export function cardTitleSize(title: string): number
export function pathPages(paths: string[], max?: number): string[][]
