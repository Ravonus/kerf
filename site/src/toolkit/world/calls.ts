import type { Participant } from '@kerf/veneer'

export const CALL: Participant[] = [
  {
    id: 'sam',
    name: 'Sam Okafor',
    role: 'host',
    isSpeaking: true,
  },
  { id: 'jun', name: 'Jun Tanaka', isMuted: true },
  { id: 'ines', name: 'Inés Vidal' },
  {
    id: 'mara',
    name: 'Mara Lindqvist',
    handRaised: true,
  },
  {
    id: 'lena',
    name: 'Lena Fischer',
    isMuted: true,
    network: 'poor',
  },
  { id: 'tomas', name: 'Tomás Oliveira', isCamOn: false },
]

export const CALL_SELF: Participant = {
  id: 'priya',
  name: 'Priya Raman',
}

export const CALL_DEVICES = {
  mics: [
    { value: 'mbp', label: 'MacBook Pro Microphone' },
    { value: 'pods', label: 'AirPods Pro' },
  ],
  cameras: [{ value: 'hd', label: 'FaceTime HD Camera' }],
  speakers: [
    { value: 'pods', label: 'AirPods Pro' },
    { value: 'mbp', label: 'MacBook Pro Speakers' },
  ],
}
