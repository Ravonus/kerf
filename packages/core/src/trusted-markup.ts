type Policy = { createHTML(value: string): unknown }
type Factory = { createPolicy(name: string, rules: { createHTML(value: string): string }): Policy }
let policy: Policy | undefined

/** Trust compiler literals and escaped same-origin renders; raw HTML bindings remain untrusted. */
export function trustedMarkup(value: string): string {
  const factory = (globalThis as typeof globalThis & { trustedTypes?: Factory }).trustedTypes
  return (
    factory
      ? (policy ??= factory.createPolicy('kerf-html', { createHTML: (html) => html })).createHTML(
          value,
        )
      : value
  ) as string
}
