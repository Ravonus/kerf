import type { Counts } from '@kerf-js/core/interaction'

export type Pair = [key: string, bits: number]
export type Triple = [id: string, key: string, bits: number]
export type Msg =
  | { t: 'tab'; tab: string; keys: Pair[]; shown: boolean; k?: string | undefined }
  | { t: 'bits'; tab: string; e: Pair[] }
  | { t: 'shown'; tab: string; shown: boolean }
  | { t: 'net'; s: Triple[] }
  | { t: 'link'; up: boolean }
  | { t: 'roll' }
  | { t: 'bye'; tab: string }

export interface Client {
  bits: number
  at: number
  stale?: boolean
}

export const lines = new Map<string, (c: Counts) => void>()
export const shown = new Map<string, Counts>()
/** key → bits, per tab, mine included. */
export const tabs = new Map<string, Map<string, number>>()
export const tabAt = new Map<string, number>()
export const visible = new Map<string, boolean>()
export const mine = new Map<string, number>()
export const watched = new Set<string>()
export const siblings = new Set<string>()
/** key → other clients. Everything the leader joined; a follower keeps what its own lines want. */
export const clients = new Map<string, Map<string, Client>>()
