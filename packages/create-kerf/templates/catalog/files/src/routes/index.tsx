import { Link, type Meta } from '@kerf-js/start'
import { Center, Grid, Heading, Stack, Text } from '@kerf-js/veneer'
import { Boundary } from '@kerf-js/core'
import { Aisles, AislesLoading } from '#/components/Aisles'
import { Failed } from '#/components/Failed'
import { Featured } from '#/components/Featured'
import { ProductArt } from '#/components/ProductArt'
import { ProductGridLoading } from '#/components/ProductCard'

export const meta: Meta = {
  title: 'Goods made to be mended',
  description: 'Explore everyday goods made to be repaired and used for years.',
}

export default function Home() {
  return (
    <Center max="wide" gutter>
      <section class="hero">
        <Stack gap="related">
          {/* kerf-allow D006: the storefront's one poster headline */}
          <Heading level={1} role="display">
            Buy it once. Mend it forever.
          </Heading>
          <Text class="lede">
            Everyday goods in oak, copper, linen and slate, built with screws instead of glue, and
            repaired free for ten years.
          </Text>
          <Link href="#featured" class="cta">
            See this month's table
          </Link>
        </Stack>
        <div class="hero-art">
          <ProductArt name="Copper Kettle" />
          <ProductArt name="Oak Stool" />
          <ProductArt name="Slate Lamp" />
        </div>
      </section>
      <Stack gap="page">
        <section aria-labelledby="aisles-title">
          <Stack gap="related">
            <Heading level={2} id="aisles-title">
              Aisles
            </Heading>
            <Boundary
              pending={<AislesLoading />}
              error={(_, retry) => <Failed what="The aisles" retry={retry} />}
            >
              <Aisles />
            </Boundary>
          </Stack>
        </section>
        <section id="featured" aria-labelledby="featured-title">
          <Stack gap="related">
            <Heading level={2} id="featured-title">
              On the front table
            </Heading>
            <Boundary
              pending={<ProductGridLoading count={12} cols={4} label="Loading featured goods" />}
              error={(_, retry) => <Failed what="The front table" retry={retry} />}
            >
              <Featured />
            </Boundary>
          </Stack>
        </section>
        <Grid min="md" cols={3} gap="group" class="promises">
          <Stack gap="tight">
            <Heading level={3}>Screws, not glue</Heading>
            <Text subtle>Every piece comes apart with a screwdriver you already own.</Text>
          </Stack>
          <Stack gap="tight">
            <Heading level={3}>Parts on the shelf</Heading>
            <Text subtle>
              Handles, hinges and cords are stocked for as long as we sell the piece.
            </Text>
          </Stack>
          <Stack gap="tight">
            <Heading level={3}>Repairs by post</Heading>
            <Text subtle>Send it in, and it comes back working. Free for ten years.</Text>
          </Stack>
        </Grid>
      </Stack>
    </Center>
  )
}
