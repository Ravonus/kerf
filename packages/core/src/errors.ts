/** JSON values that an adapter has approved for public delivery. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/** Approved validation copy and its optional field path. */
export interface PublicFieldIssue {
  readonly message: string
  readonly path?: readonly (string | number)[]
}

/** Safe failure data before an adapter maps it to its transport's fields. */
export interface PublicFailure {
  readonly code: string
  readonly message: string
  readonly status: number
  readonly ref?: string
  readonly issues?: readonly PublicFieldIssue[]
  readonly data?: JsonValue
}

/** Common error value for Kerf packages, with native Error stack and cause semantics. */
export class KerfError extends Error {}
