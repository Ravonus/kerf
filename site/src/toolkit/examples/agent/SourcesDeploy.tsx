import { Sources } from '@weft-js/warp'
import { DEPLOY_SOURCES } from '../../world'

export const SourcesDeploy = () => (
  <Sources
    items={DEPLOY_SOURCES}
    base="deploy"
  />
)
