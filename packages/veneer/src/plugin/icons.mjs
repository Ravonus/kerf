// The icon tier each expression stop draws (veneer.css §2: --veneer-icon-*). `veneer({ icons })` pins one whatever the
// expression, the way `radius` replaces the corners each stop sets.
export const ICONS = {
  quiet: { o: 'inline', q: 'inline', b: 'none', v: 'none', fine: 'none', kerf: 1.5 },
  balanced: { o: 'inline', q: 'none', b: 'inline', v: 'none', fine: 'inline', kerf: 2 },
  vivid: { o: 'none', q: 'none', b: 'none', v: 'inline', fine: 'inline', kerf: 2 },
}
