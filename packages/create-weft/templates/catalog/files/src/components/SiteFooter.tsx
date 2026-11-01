import { Center, Row, Text } from '@weft/warp'

export function SiteFooter() {
  return (
    <footer class="site-foot">
      <Center max="wide" gutter>
        <Row justify="between" gap="related">
          <Text subtle>Mendwell. Goods made to be used hard and fixed when they wear.</Text>
          <Text subtle>Free repairs for the first ten years.</Text>
        </Row>
      </Center>
    </footer>
  )
}
