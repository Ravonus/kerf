import { state } from '@weft-js/core'
import { PlanPicker, Toaster } from '@weft-js/warp'
import { PLANS } from '../../world'
import { wait } from './shared'

// -- billing --

export function PlanPickerTeam() {
  const current = state('team')
  const change = async (plan: { id: string }) => {
    await wait(700)
    current.value = plan.id
  }
  return (
    <>
      <PlanPicker
        plans={PLANS}
        current={current.value}
        seats={8}
        daysLeft={9}
        losses={(plan) =>
          plan.id === 'hobby' ? ['Preview environments', '7 of your 10 seats'] : []
        }
        onChange={change}
      />
      <Toaster />
    </>
  )
}
