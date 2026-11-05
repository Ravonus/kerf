import {
  DitherStage,
  Split,
  Card,
  Stack,
  Text,
  Row,
  Button,
  Badge,
} from '@weft-js/warp'

// Ordinary warp components sit on the stage and paint
// themselves; only the skinned parts are drawn in cells.
export const StageHybrid = () => (
  <DitherStage
    kind="flow"
    ramp="info"
    style="padding:28px"
  >
    <Split
      side="end"
      width="list"
      gap="group"
    >
      <Card
        title="storefront"
        eyebrow="Live in eu-west"
      >
        <Stack gap="related">
          <Text subtle>
            412 deploys, 99.98% uptime, 84 ms at p95.
          </Text>
          <Row gap="related">
            <Button>Open</Button>
            <Button
              emphasis="outline"
              tone="neutral"
            >
              Logs
            </Button>
            <Badge tone="positive">Healthy</Badge>
          </Row>
        </Stack>
      </Card>
      <Stack
        gap="related"
        data-skin="card"
      >
        <h3
          data-skin="type"
          style="font-size:28px"
        >
          Drawn in cells
        </h3>
        <div
          data-skin="art"
          data-kind="rings"
          role="img"
          aria-label={[
            'Rings spreading over a ',
            'dithered field',
          ].join('')}
        ></div>
        <button data-skin="button">Promote</button>
      </Stack>
    </Split>
  </DitherStage>
)
