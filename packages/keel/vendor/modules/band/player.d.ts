import type { Score } from "./score.js";
/** Options for `createBand`. */
export interface BandOptions {
    /** Where the band plays. Default: the context's destination. */
    readonly destination?: AudioNode;
    /** Master level, 0 to 1. Default 0.8. */
    readonly gain?: number;
    /** How far ahead of the sound notes are scheduled, in seconds. Default 0.15. */
    readonly lookahead?: number;
}
/** What `schedule` writes: how many steps, from which step, starting when, at what energy. */
export interface ScheduleOptions {
    readonly steps: number;
    readonly from?: number;
    readonly at?: number;
    readonly energy?: number;
}
/** A band bound to one audio context. */
export interface Band {
    /** The master gain node, for a host that wants to meter or route it. */
    readonly output: AudioNode;
    /** The next step to be scheduled, in sixteenths from the start. */
    readonly step: number;
    readonly playing: boolean;
    /** Starts the score from the top. The context must be running (start it from a tap or key). */
    start(score: Score, energy?: number): void;
    /** Changes score at the next bar line, keeping time. */
    setScore(score: Score): void;
    /** How much of the band plays, 0 to 1, from the next step: tie it to a scroll, a level, a mood. */
    setEnergy(energy: number): void;
    /** Fades the master level over `seconds` (default 0.3). */
    setGain(gain: number, seconds?: number): void;
    /** Writes a stretch of the score into the context at once, for an OfflineAudioContext. Returns its end time. */
    schedule(score: Score, options: ScheduleOptions): number;
    stop(): void;
}
/**
 * Makes a band on an audio context. It makes no sound until `start`.
 *
 * @param ctx An AudioContext, or an OfflineAudioContext for `schedule`.
 * @param options The destination, level and lookahead.
 */
export declare function createBand(ctx: BaseAudioContext, options?: BandOptions): Band;
