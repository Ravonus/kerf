import { Sources } from '@kerf-js/veneer'
import { DEPLOY_SOURCES } from '../../world'

export const SourcesDeploy = () => (
  <Sources
    items={DEPLOY_SOURCES}
    base="deploy"
  />
)
