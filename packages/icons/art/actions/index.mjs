// Action icons: a part of the drawing that moves, and how. Each is its own module with its own stylesheet, so an app pays
// for the ones it uses and the set pays nothing for having them. Outlines ease; pixels move in whole cells, in frames.
const px = (n) => `${n * 1.5}px` // one pixel-tier cell in the 24 box

export default {
  trash: {
    still: 'pl 2.5,3 3.5,13 10.5,13 11.5,3 / ln 5.5,6 5.5,10; ln 8.5,6 8.5,10',
    moving: 'ln 1,3 13,3; pl 5,3 5,1 9,1 9,3',
    cells: (x, y) => y < 4,
    origin: '3px 6px',
    ms: 420,
    keyframes: 'from,to { transform: none } 45% { transform: translateY(-1.5px) rotate(-7deg) }',
    frames: `from,to { transform: none } 25%,75% { transform: translateY(${px(-1)}) }`,
    steps: 'step-end',
  },
  bell: {
    origin: '12px 2px',
    ms: 640,
    keyframes:
      'from,to { transform: none } 20% { transform: rotate(14deg) } 45% { transform: rotate(-11deg) } 70% { transform: rotate(6deg) }',
    frames: `from,to { transform: none } 20%,60% { transform: translateX(${px(1)}) } 40%,80% { transform: translateX(${px(-1)}) }`,
    steps: 'step-end',
  },
  check: {
    draw: true,
    ms: 320,
    keyframes: 'from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 }',
    frames: 'from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) }',
    steps: 'steps(6, end)',
  },
  refresh: {
    origin: '12px 12px',
    ms: 720,
    loop: true,
    keyframes: 'to { transform: rotate(360deg) }',
    frames: 'to { transform: rotate(360deg) }',
    steps: 'steps(4, end)',
  },
  copy: {
    still: 'rect 1 1 8 8',
    moving: 'box 5 5 8 8',
    ms: 360,
    keyframes: 'from { transform: translate(-6px, -6px) } to { transform: none }',
    frames: `from { transform: translate(${px(-4)}, ${px(-4)}) } to { transform: none }`,
    steps: 'steps(4, end)',
  },
}
