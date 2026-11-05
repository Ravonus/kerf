export const BUILD_FLOW = {
  nodes: [
    { name: 'Push to main', column: 0 },
    { name: 'Pull request', column: 0 },
    { name: 'Scheduled', column: 0 },
    { name: 'Tests passed', column: 1 },
    { name: 'Tests failed', column: 1 },
    { name: 'Live', column: 2 },
    { name: 'Preview', column: 2 },
    { name: 'Rolled back', column: 2 },
  ],
  data: [
    { from: 0, to: 3, value: 412 },
    { from: 0, to: 4, value: 46 },
    { from: 1, to: 3, value: 688 },
    { from: 1, to: 4, value: 174 },
    { from: 2, to: 3, value: 90 },
    { from: 2, to: 4, value: 12 },
    { from: 3, to: 5, value: 470 },
    { from: 3, to: 6, value: 688 },
    { from: 3, to: 7, value: 32 },
  ],
}
