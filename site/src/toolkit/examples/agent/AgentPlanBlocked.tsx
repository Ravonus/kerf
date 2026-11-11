import { AgentPlan } from '@kerf-js/veneer'

export const AgentPlanBlocked = () => (
  <AgentPlan
    steps={[
      {
        id: 'a',
        title: 'Check that d-4801 is healthy',
        state: 'done',
      },
      {
        id: 'b',
        title: 'Roll back ap-south',
        state: 'blocked',
      },
      {
        id: 'c',
        title: 'Watch the health checks',
        state: 'pending',
      },
    ]}
  />
)
