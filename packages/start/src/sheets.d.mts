export interface Sheet {
  href: string
  has: string[]
}
export function pick(
  plan: { shared?: Sheet; routes: Sheet[] },
  list: string[],
): { sheets: Sheet[]; rest: string[] }
export function reach(files: string[]): Set<string>
export function planSheets(
  routes: string[][],
  text: (name: string) => string,
): {
  shared: { file: string; has: string[] } | undefined
  routes: { file: string; has: string[] }[]
  files: Record<string, string>
}
