// <Media> over a built asset (the shape `?media` imports produce), mounted: the component's own cost.
import { render } from '@kerf-js/core/dom'
import { Media, type MediaAsset } from '@kerf-js/core/media'

const hero: MediaAsset = {
  kind: 'photo',
  src: '/assets/hero-1280.jpg',
  width: 1280,
  height: 853,
  type: 'image/jpeg',
  name: 'hero.jpg',
  quality: 'ssimulacra2',
  dominant: '#6a7f8c',
  placeholder: 'data:image/webp;base64,UklGRg==',
  sources: [
    { type: 'image/avif', srcset: '/assets/hero-640.avif 640w, /assets/hero-1280.avif 1280w' },
    { type: 'image/jpeg', srcset: '/assets/hero-640.jpg 640w, /assets/hero-1280.jpg 1280w' },
  ],
}
render(
  () => <Media src={hero} alt="Studio at night" width="1/2" priority />,
  document.getElementById('app')!,
)
