// Deterministic data for every chart form: a small version of each specimen dataset.
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const wave = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => Math.round(f(i) * 100) / 100)
export const money = (v: number) => `$${Math.round(v / 1000)}k`
export const revenue = months.map((month, i) => ({ month, subs: 40000 + i * 3200, usage: 12000 + i * i * 300, services: 18000 + (i % 3) * 1500 }))
export const seats = ['Q1', 'Q2', 'Q3', 'Q4'].map((quarter, i) => ({ quarter, free: 40 + i * 6, team: 30 + i * 4, business: 12 + i * 3, enterprise: 5 + i }))
export const combo = months.map((month, i) => ({ month, revenue: [42, 48, 45, 61, 58, 66, 71, 64, 80, 77, 92, 98][i]! * 1000 }))
export const slices = [{ name: 'Free', value: 1240 }, { name: 'Team', value: 610 }, { name: 'Business', value: 240 }, { name: 'Enterprise', value: 82 }]
export const goals = [{ name: 'Activation', value: 0.82 }, { name: 'Retention', value: 0.64 }, { name: 'Expansion', value: 0.41 }, { name: 'Referral', value: 0.23 }]
export const steps = [{ name: 'Visited', value: 12400 }, { name: 'Signed up', value: 2232 }, { name: 'Created project', value: 1410 }, { name: 'Invited', value: 760 }, { name: 'Paid', value: 508 }]
export const groups = ['Hobby', 'Team', 'Enterprise'].map((name, g) => ({ name, points: wave(6, i => i).map(i => ({ name: `${name} ${i + 1}`, x: 10 + i * 14 + g * 3, y: 20 + ((i * 7 + g * 13) % 60), size: 4 + i * 6 })) }))
export const latency = wave(240, i => 40 + (i % 17) * 6 + (i % 41 === 0 ? 180 : 0))
export const heat = { weeks: wave(26, i => i).map(i => `W${i + 1}`), data: wave(26, i => i).map(w => wave(7, d => (d > 4 ? 0 : (w * 3 + d * 5) % 9))) }
export const radar = { axes: ['Speed', 'Size', 'A11y', 'Docs', 'SSR', 'Live'], data: [{ name: 'warp', values: [0.92, 0.95, 0.9, 0.7, 0.88, 0.94] }, { name: 'Typical kit', values: [0.6, 0.45, 0.62, 0.86, 0.55, 0.3] }] }
export const budget = ['Apollo', 'Borealis', 'Cirrus', 'Delta', 'Ember', 'Fathom', 'Gale', 'Halo'].map((name, i) => ({ name, value: 90 - i * 10, group: ['Active', 'Paused', 'Review'][i % 3] }))
export const spend = [{ name: 'Compute', children: [{ name: 'API', value: 28 }, { name: 'Workers', value: 18 }, { name: 'Edge', value: 9 }] }, { name: 'Storage', children: [{ name: 'DB', value: 16 }, { name: 'Files', value: 11 }] }, { name: 'Network', children: [{ name: 'CDN', value: 10 }, { name: 'Egress', value: 8 }] }]
export const flow = { nodes: [{ name: 'Organic', column: 0 }, { name: 'Paid', column: 0 }, { name: 'Trial', column: 1 }, { name: 'Bounced', column: 1 }, { name: 'Paid plan', column: 2 }, { name: 'Churned', column: 2 }], data: [{ from: 0, to: 2, value: 420 }, { from: 0, to: 3, value: 380 }, { from: 1, to: 2, value: 260 }, { from: 1, to: 3, value: 340 }, { from: 2, to: 4, value: 400 }, { from: 2, to: 5, value: 280 }] }
export const candles = wave(30, i => i).map(i => { const open = 140 + Math.sin(i / 3) * 6, close = open + (i % 3 === 0 ? -2.5 : 2); return { label: `Sep ${i + 1}`, open, close, high: Math.max(open, close) + 1.5, low: Math.min(open, close) - 1.5 } })
export const regions = ['us-east', 'eu-west', 'ap-south', 'us-west'].map((name, g) => ({ name, values: wave(60, i => 80 + g * 18 + (i % 23) * 2 + (i === 7 ? 120 : 0)) }))
export const bridge = [{ name: 'Start ARR', value: 820, total: true }, { name: 'New', value: 210 }, { name: 'Expansion', value: 96 }, { name: 'Contraction', value: -38 }, { name: 'Churn', value: -74 }, { name: 'End ARR', value: 1014, total: true }]
export const window60 = wave(60, i => 50 + Math.sin(i / 5) * 12 + (i % 4))
export const signups = wave(180, i => 120 + Math.sin(i / 9) * 30 + i * 0.4).map((signups, i) => ({ day: `D${i + 1}`, signups }))
export const states = 'AK,ME,VT,NH,WA,ID,MT,ND,MN,IL,WI,MI,NY,RI,MA,OR,NV,WY,SD,IA,IN,OH,PA,NJ,CT,CA,UT,CO,NE,MO,KY,WV,VA,MD,DE,AZ,NM,KS,AR,TN,NC,SC,DC,OK,LA,MS,AL,GA,HI,TX,FL'.split(',').map((id, i) => ({ id, value: 10 + (i * 37) % 90 }))
