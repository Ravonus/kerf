import { Heading } from '@kerf-js/veneer'

export const HeadingPlay = (p: {
  children: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  role: 'auto' | 'display' | 'title' | 'heading' | 'label'
}) => (
  <Heading
    level={p.level}
    role={p.role === 'auto' ? undefined : p.role}
  >
    {p.children}
  </Heading>
)
