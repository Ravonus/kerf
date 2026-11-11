// Decode entities before checking the URL scheme.
export const unesc = (s: string) =>
  s.replace(
    /&(lt|gt|quot|#39|amp);/g,
    (_, e) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", amp: '&' })[e as 'lt'],
  )

/** http, https, mailto and relative only (04 Markdown). */
export const safeUrl = (url: string) => {
  // browsers drop tabs, line breaks and controls before reading a scheme
  // oxlint-disable-next-line no-control-regex -- the point: these are what hide a scheme
  const u = unesc(url).replace(/[\u0000- ]+/g, '')
  return /^(https?:|mailto:|\/(?![/\\])|#|\.)/i.test(u) || !/^[a-z][a-z0-9+.-]*:|^[/\\]{2}/i.test(u)
    ? u
    : null
}
