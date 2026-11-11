import { Button } from '@kerf/veneer'

export const ButtonIconOnly = () => (
  <>
    <Button
      icon="plus"
      label="New project"
    />
    <Button
      emphasis="outline"
      tone="neutral"
      icon="settings"
      label="Settings"
    />
    <Button
      emphasis="ghost"
      tone="neutral"
      icon="trash"
      label="Delete"
    />
  </>
)
