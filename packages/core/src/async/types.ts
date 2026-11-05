/** An async value: what it holds now, whether a fetch is in flight, and how it last failed. */
export interface Resource<T> {
  readonly value: T | undefined
  /** A fetch is in flight (the first or a refresh). */
  readonly pending: boolean
  readonly error: unknown
  /** Fetch again. The current value stays until the new one lands. */
  refresh(): void
  /** A placeholder value of the result's type (research 31 §2): what a pending view sizes itself from. */
  readonly shape?: T | undefined
}

/** How a resource starts and transfers. */
export interface ResourceOptions<T> {
  initial?: T
  /**
   * `false`: the value isn't written into the page's data or read back from it, because the caller's own cache
   * transfers it (@weft-js/start's query cache, research 27 §4). The fetcher is called on every server pass (return the
   * value synchronously once it's known) and during hydration (return the transferred value synchronously, so the
   * resource settles as it's created and hydration writes nothing).
   */
  data?: false
  /** Where `.shape` comes from, and what a shape variant asks for this resource by (`of`, research 31 §5). */
  shape?: { of: unknown; read(): T | undefined }
}
