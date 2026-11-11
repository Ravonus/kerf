import { Accordion } from '@kerf-js/veneer'

export const AccordionDisabled = () => (
  <Accordion
    items={[
      {
        value: 'plan',
        title: 'Plan',
        content: 'Team, billed monthly.',
      },
      {
        value: 'seats',
        title: 'Seats',
        content: 'Eight of ten in use.',
      },
      {
        value: 'sso',
        title: 'Single sign-on (Enterprise)',
        content: '',
        disabled: true,
      },
    ]}
  />
)
