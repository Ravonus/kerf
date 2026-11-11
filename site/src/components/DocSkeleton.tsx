/**
 * What a move between docs pages shows until the page arrives: the doc article's own outline (crumb, title, lede, the
 * copy button, paragraphs, a code block, a heading, the pager) and the contents column beside it, so the swap moves
 * nothing. The bars are Veneer's skeleton (`data-scope="skeleton"`); docs.css sizes them.
 *
 * Navigation draws it before any of the page's code loads, so it is plain markup only: no components, and string
 * `class` and `data-*` attributes. Keep it in step with the doc article in the routes that use it.
 */
export function DocSkeleton() {
  return (
    <div data-site="doc-skeleton">
      <article data-site="doc">
        <header>
          <p data-part="crumb">
            <span data-scope="skeleton" data-bar="crumb"></span>
          </p>
          <h1>
            <span data-scope="skeleton" data-bar="title"></span>
          </h1>
        </header>
        <div data-part="lead">
          <span data-scope="skeleton" data-bar="lede"></span>
          <span data-scope="skeleton" data-bar="lede-end"></span>
        </div>
        <p data-part="actions">
          <span data-scope="skeleton" data-bar="button"></span>
        </p>
        <div data-part="body">
          <span data-scope="skeleton" data-bar="line"></span>
          <span data-scope="skeleton" data-bar="line"></span>
          <span data-scope="skeleton" data-bar="line-end"></span>
          <span data-scope="skeleton" data-bar="code"></span>
          <span data-scope="skeleton" data-bar="heading"></span>
          <span data-scope="skeleton" data-bar="line"></span>
          <span data-scope="skeleton" data-bar="line"></span>
          <span data-scope="skeleton" data-bar="line-end"></span>
        </div>
      </article>
      <div data-site="toc">
        <span data-scope="skeleton" data-bar="toc-label"></span>
        <span data-scope="skeleton" data-bar="toc"></span>
        <span data-scope="skeleton" data-bar="toc"></span>
        <span data-scope="skeleton" data-bar="toc"></span>
      </div>
    </div>
  )
}
