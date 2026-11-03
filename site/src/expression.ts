/**
 * The site's expression, before anyone picks one. The head script writes it on <html> before the first paint, and the
 * controls that show the dial start from it, so the server renders the selection the page will hold (no flip on hydration).
 */
export const EXPRESSION = 'vivid' as const
