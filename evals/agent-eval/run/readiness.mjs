// Metadata gates apply to both the plan and ordinary grading.
export function taskReadiness(task, definition) {
  return definition.gradeable === true ? [] : [`${task}: grader is incomplete`]
}
