// Emoji DOM measurement moved from @chenglou/pretext 1.0.0.
// The page's width of one emoji in the font, or NaN where the page has no box for it. The
// span takes two things from the page, the font asked for and the page's language, which
// picks fonts as it does for Canvas (-webkit-locale is where Blink and WebKit keep it, and
// `all` resets it; Gecko's -x-lang is internal and `all` leaves it). Everything else is at
// its initial value, and important, so that nothing the page declares reaches the span,
// inherited from <body> or matched by a rule: a letter-spacing, a text-indent or a padding
// would be read as part of the emoji, and a vertical writing-mode gives a line's height.
export function readEmojiWidth(font: string): number {
  // The span goes in <body>, beside the page's text, and in <html> where that gives it no
  // box: document.body is null until the parser reaches <body>, and a <body> that is
  // display: none, as a page hidden until it is ready, has no boxes. A document whose root
  // isn't <html>, as an SVG file's, has neither a body nor a head, and lays out no HTML.
  // lib.dom's types leave the nulls out.
  const body = document.body as HTMLElement | null
  if (body === null && (document.head as HTMLElement | null) === null) return NaN
  const span = document.createElement('span')
  span.style.cssText = 'all:initial!important;-webkit-locale:inherit!important;display:inline-block!important;visibility:hidden!important;position:absolute!important'
  span.style.setProperty('font', font, 'important')
  span.textContent = '\u{1F600}'
  let width = body === null ? NaN : readWidthIn(body, span)
  if (Number.isNaN(width)) width = readWidthIn(document.documentElement, span)
  return width
}

// The span's width under a parent. Its resolved width is its box's used width in the span's
// own pixels, and `auto`, so NaN, where it has no box (nsComputedDOMStyle::DoGetWidth,
// nsComputedDOMStyle.cpp:1803-1814; StyleExtractorCustom.h:570-576 in WebKit; Blink hands the
// property the element's LayoutObject, css_computed_style_declaration.cc:381-383), but it is
// written with six significant digits. Its rectangle has every digit, but is the box as
// drawn: a transform or a zoom above the span scales it, and it is 0 with no box, which read
// as an emoji 0px wide. So the rectangle's width is taken where it is the resolved one
// within those digits, and the resolved one where something scales the span. The rectangle
// is asked first: before the parser reaches <body>, Firefox makes the document's first boxes
// for a rectangle and not for a resolved width, which is `auto` until then.
function readWidthIn(parent: HTMLElement, span: HTMLElement): number {
  parent.appendChild(span)
  const drawn = span.getBoundingClientRect().width
  const width = parseFloat(getComputedStyle(span).width)
  parent.removeChild(span)
  return Math.abs(drawn - width) <= width * 1e-5 ? drawn : width
}
