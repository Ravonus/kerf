// There are no product photos yet, so each product draws itself: the object in its name, in its material's colour.
// Swap this for an `<Image>` when real photography arrives.
const objects: Record<string, string> = {
  lamp: 'M44 22h32l12 34H32zM57 56h6v36h-6zM42 92h36a4 4 0 0 1 4 4v2H38v-2a4 4 0 0 1 4-4z',
  stool: 'M30 34h60a6 6 0 0 1 0 12H30a6 6 0 0 1 0-12zM36 46h9l-7 54h-8zM75 46h9l7 54h-8zM42 70h36v6H42z',
  kettle: 'M38 48h44c6 12 10 24 10 38a10 10 0 0 1-10 10H38a10 10 0 0 1-10-10c0-14 4-26 10-38zM52 38h16v10H52zM44 40c0-22 32-22 32 0h-6c0-14-20-14-20 0zM28 60 12 50l-2 6 14 16z',
  shelf: 'M22 30h76v6H22zM22 60h76v6H22zM22 90h76v6H22zM30 22h6v8h-6zM30 36h6v24h-6zM30 66h6v24h-6zM30 96h6v8h-6zM84 22h6v8h-6zM84 36h6v24h-6zM84 66h6v24h-6zM84 96h6v8h-6z',
  basket: 'M24 56h72l-8 42a6 6 0 0 1-6 5H38a6 6 0 0 1-6-5zM34 56c0-40 52-40 52 0h-7c0-30-38-30-38 0z',
  speaker: 'M38 18h44a6 6 0 0 1 6 6v72a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6zM60 30a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 26a16 16 0 1 0 0 32 16 16 0 0 0 0-32z',
  tray: 'M14 66h92l-6 16a6 6 0 0 1-6 4H26a6 6 0 0 1-6-4zM8 60h22v6H8zM90 60h22v6H90z',
  planter: 'M34 62h52l-6 40a6 6 0 0 1-6 4H46a6 6 0 0 1-6-4zM57 62V38c-16 0-24-8-26-22 16 0 26 8 29 20 3-12 13-20 29-20-2 14-10 22-26 22v24z',
  satchel: 'M26 42h68a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6V48a6 6 0 0 1 6-6zM42 42c0-24 36-24 36 0h-7c0-14-22-14-22 0zM54 56h12v16H54z',
  mug: 'M30 34h50v54a10 10 0 0 1-10 10H40a10 10 0 0 1-10-10zM80 46h8a14 14 0 0 1 0 28h-8v-7h8a7 7 0 0 0 0-14h-8z',
}
const box = 'M30 40h60v56H30zM24 30h72v10H24z'

const word = (name: string, among: readonly string[]) => name.toLowerCase().split(/\s+/).find(w => among.includes(w))
const materials = ['oak', 'linen', 'copper', 'slate', 'walnut', 'cedar', 'ceramic', 'brass']
const shapes = Object.keys(objects)

export function ProductArt({ name }: { name: string }) {
  const material = () => word(name, materials) ?? 'plain'
  const path = () => objects[word(name, shapes) ?? ''] ?? box
  return (
    <span class="art" data-material={material()}>
      <svg viewBox="0 0 120 120" aria-hidden="true"><path fill-rule="evenodd" d={path()} /></svg>
    </span>
  )
}
