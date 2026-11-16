import { imagePreloads } from '../src/server/image-preloads'
test('only eager priority images move ahead of script preloads', () => {
  expect(
    imagePreloads(
      '<img src="/lazy.webp" loading="lazy" fetchpriority="high"><img src="/plain.webp"><img src="/art.webp" fetchpriority="high">',
    ),
  ).toBe('<link rel="preload" as="image" fetchpriority="high" href="/art.webp">\n')
})
test('the first supported picture format retains its responsive ladder and sizes', () => {
  const hints = imagePreloads(
    '<picture><source type="image/avif" srcset="/a.avif 384w, /b.avif 672w" sizes="calc(100vw - 40px)"><source type="image/webp" srcset="/a.webp 384w"><img src="/fallback.png" fetchpriority="high"></picture>',
  )
  expect(hints).toContain(
    'href="/a.avif" type="image/avif" imagesrcset="/a.avif 384w, /b.avif 672w" imagesizes="calc(100vw - 40px)"',
  )
  expect(hints).not.toContain('.webp')
  expect(hints).not.toContain('fallback')
})
test('mobile and desktop art directions have complementary preloads', () => {
  const hints = imagePreloads(
    '<picture><source type="image/avif" media="(max-width: 767px) and (orientation: portrait)" srcset="/phone.avif 720w"><source type="image/webp" media="(max-width: 767px) and (orientation: portrait)" srcset="/phone.webp 720w"><source type="image/avif" srcset="/wide.avif 1280w"><img src="/fallback.webp" fetchpriority="high"></picture>',
  )
  expect(hints).toContain('media="(max-width: 767px) and (orientation: portrait)"')
  expect(hints).toContain('media="not all and (max-width: 767px) and (orientation: portrait)"')
  expect(hints.match(/<link/g)).toHaveLength(2)
})
test('inert, unsafe and duplicate hints cannot become extra requests', () => {
  const image = '<img src="/a.jpg?x=1&amp;y=2" fetchpriority="high">'
  const hints = imagePreloads(
    '<noscript>' +
      image +
      '</noscript><script>' +
      image +
      '</script><!--' +
      image +
      '-->' +
      image +
      image +
      image,
  )
  expect(hints).toBe(
    '<link rel="preload" as="image" fetchpriority="high" href="/a.jpg?x=1&amp;y=2">\n',
  )
  expect(imagePreloads('<img src="javascript:alert(1)" fetchpriority="high">')).toBe('')
})
