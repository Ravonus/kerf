import basket from '@/assets/products/basket.webp'
import kettle from '@/assets/products/kettle.webp'
import lamp from '@/assets/products/lamp.webp'
import mug from '@/assets/products/mug.webp'
import planter from '@/assets/products/planter.webp'
import satchel from '@/assets/products/satchel.webp'
import shelf from '@/assets/products/shelf.webp'
import speaker from '@/assets/products/speaker.webp'
import stool from '@/assets/products/stool.webp'
import tray from '@/assets/products/tray.webp'

// The seed names a product by its id: noun by id % 10, material by id % 8.
const byNoun = [lamp, stool, kettle, shelf, basket, speaker, tray, planter, satchel, mug]
const byMaterial = ['bg-[#e8d9c3]', 'bg-[#e6e0d2]', 'bg-[#eccfb6]', 'bg-[#d5dad9]', 'bg-[#dfcdb9]', 'bg-[#e9d8c2]', 'bg-[#e4e1dc]', 'bg-[#ecdca8]']

export const productArt = (id: number) => ({ image: byNoun[id % 10], tile: byMaterial[id % 8] })

const byCategory: Record<string, typeof lamp> = { kitchen: kettle, garden: planter, office: shelf, outdoor: basket, audio: speaker, lighting: lamp, travel: satchel, bath: tray }

export const categoryArt = (slug: string) => byCategory[slug] ?? lamp
