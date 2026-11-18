import { Heading, Text } from './Type'
import './styles'
import '@kerf-js/veneer-core/styles/components/section-heading.css'

/** A section title, optional context and actions. Other attributes land on the wrapper. */
export interface SectionHeadingProps {
  title: unknown
  level?: Parameters<typeof Heading>[0]['level']
  role?: Parameters<typeof Heading>[0]['role']
  eyebrow?: unknown
  description?: unknown
  actions?: unknown
  [attr: string]: unknown
}

/** A heading block with actions that wrap below the copy when space runs out. */
export function SectionHeading({
  title,
  level,
  role,
  eyebrow,
  description,
  actions,
  ...rest
}: SectionHeadingProps) {
  return (
    <div {...rest} data-scope="section-heading">
      <div data-part="section-copy">
        {eyebrow != null && (
          <Text role="eyebrow" subtle data-part="section-eyebrow">
            {eyebrow}
          </Text>
        )}
        <Heading level={level} role={role} data-part="section-title">
          {title}
        </Heading>
        {description != null && (
          <Text subtle data-part="section-description">
            {description}
          </Text>
        )}
      </div>
      {actions != null && <div data-part="section-actions">{actions}</div>}
    </div>
  )
}
