/**
 * The most stylesheet text one page carries inline, in characters. Past it a sheet stays a link, cached across pages.
 * Set so a whole page fits: one sheet left as a link holds the first paint for its round trip, whatever the rest saved.
 */
export const INLINE_CSS_MAX = 256 * 1024
