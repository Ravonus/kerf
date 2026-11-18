/** File name of the release-owned shell document a shell-only build emits. */
export const SHELL_FILE: 'kerf-shell.html'

/** Build the shell document: release entry, styles and module preloads, an empty mount, and nothing from a request. */
export function shellDocument(options: {
  entry: string
  css?: string[] | undefined
  js?: string[] | undefined
  locale?: string | undefined
  dev?: boolean
}): string
