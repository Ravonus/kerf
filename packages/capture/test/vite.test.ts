import { postersModule } from '@kerf-js/capture/vite'

test('before a bake the posters module registers none', () => {
  expect(postersModule('/p', null)).toBe(
    "import { bakedPosters } from '@kerf-js/veneer/scenes'\nexport default bakedPosters({  })",
  )
})

test('a manifest becomes one asset import per still, under its scene id and tier', () => {
  const still = (src: string) => ({
    kind: 'photo' as const,
    src,
    width: 2,
    height: 1,
    type: 'image/avif',
    sources: [],
    name: src,
    bytes: 9,
    ms: 3,
  })
  const code = postersModule('/p', {
    format: 'avif',
    quality: 50,
    seconds: 0,
    ms: 1,
    tiers: {},
    posters: { hero: { desktop: still('hero.desktop.avif'), mobile: still('hero.mobile.avif') } },
  })
  expect(code).toContain('import still0 from "/p/hero.desktop.avif"')
  expect(code).toContain('import still1 from "/p/hero.mobile.avif"')
  expect(code).toMatch(/"hero": \{ "desktop": \{ \.\.\.\{[^}]*"width":2[^}]*\}, src: still0 \}/)
  expect(code).not.toContain('"bytes"')
})
