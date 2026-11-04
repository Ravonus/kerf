import a640 from '~/assets/hero-640.avif?url'
import a960 from '~/assets/hero-960.avif?url'
import a1280 from '~/assets/hero-1280.avif?url'
import a1600 from '~/assets/hero-1600.avif?url'
import w640 from '~/assets/hero-640.webp?url'
import w960 from '~/assets/hero-960.webp?url'
import w1280 from '~/assets/hero-1280.webp?url'
import w1600 from '~/assets/hero-1600.webp?url'

const SIZES = '(min-width: 1024px) 560px, (min-width: 640px) 80vw, 100vw'

export const HeroImage = () => (
  <picture>
    <source
      type="image/avif"
      sizes={SIZES}
      srcset={`${a640} 640w, ${a960} 960w, ${a1280} 1280w, ${a1600} 1600w`}
    />
    <source
      type="image/webp"
      sizes={SIZES}
      srcset={`${w640} 640w, ${w960} 960w, ${w1280} 1280w, ${w1600} 1600w`}
    />
    <img
      src={w960}
      width="1600"
      height="1040"
      fetchpriority="high"
      alt="The Emberline board: customer requests grouped into Now, Next and Later, with a quote from a renewal call"
      class="h-auto w-full rounded-2xl shadow-card ring-1 ring-line"
    />
  </picture>
)
